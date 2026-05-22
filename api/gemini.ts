/**
 * Vercel Edge Function — Gemini AI
 * Implémentation via l'API REST Gemini (fetch natif) — aucune dépendance npm.
 * Version instrumentée avec support bivalent Node.js / Edge Runtime et utilisation du service logger.
 */

import { toolDeclarations, executeTool } from "./tools/index";
import { SYSTEM_PROMPT } from "../src/services/prompts";
import { buildEnrichedUserPrompt, GOOGLE_PLACES_TOOL_NAME, markToolUsedIfUseful, prefetchGooglePlaces } from "../src/services/geminiShared";
import type { GenerateMessageParams } from "../src/types/gemini.types";
import { logger } from "../src/services/logger";

export const runtime = "edge";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } & Record<string, unknown> }
  | { functionResponse: { id?: string; name: string; response: { output: string } } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

interface GeminiApiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { code: number; message: string };
}

interface NodeRequestLike {
  method?: string;
  body?: unknown;
}

interface NodeResponseLike {
  status: (code: number) => {
    setHeader: (k: string, v: string) => NodeResponseLike;
    send: (body: string) => void;
  };
  send: (body: string) => void;
}

function extractText(data: GeminiApiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p): p is { text: string } => "text" in p);
  return textPart?.text ?? "";
}

async function callGeminiAPI(apiKey: string, contents: GeminiContent[], withTools: boolean): Promise<GeminiApiResponse> {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    ...(withTools ? { tools: [{ functionDeclarations: toolDeclarations.functionDeclarations }] } : {}),
  };

  logger.debug("gemini", `[EDGE-GEMINI] Envoi du fetch REST à Google (withTools: ${withTools})...`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[EDGE-GEMINI] HTTP Erreur ${response.status}:`, errorText);
    throw new Error(`Gemini HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as GeminiApiResponse;
  if (data.error) {
    logger.error(`[EDGE-GEMINI] Erreur renvoyée par le payload Google:`, data.error);
    throw new Error(`Gemini ${data.error.code}: ${data.error.message}`);
  }
  return data;
}

const RETRY_DELAYS_MS = [1_000, 2_000];

async function callWithRetry(apiKey: string, contents: GeminiContent[], withTools: boolean): Promise<GeminiApiResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      logger.debug("gemini", `[EDGE-GEMINI] Retry temporisé (tentative ${attempt}/${RETRY_DELAYS_MS.length})...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1] as number));
    }
    try {
      return await callGeminiAPI(apiKey, contents, withTools);
    } catch (error) {
      logger.error(`[EDGE-GEMINI] Échec de la tentative ${attempt}:`, error);
      if (error instanceof Error && error.message.includes("429")) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export default async function handler(request: Request | NodeRequestLike, response?: NodeResponseLike): Promise<Response | void> {
  logger.debug("gemini", "[EDGE-HANDLER] 📥 Nouvelle requête reçue.");

  // DETECTION INFAILLIBLE : Si .json n'est pas une fonction, on est purement sous Node.js (Vercel Dev)
  const isNodeEnvironment = !(request instanceof Request);

  let method: string;
  let rawBody: unknown;

  if (isNodeEnvironment) {
    const nodeRequest = request as NodeRequestLike;
    method = nodeRequest.method ?? "POST";
    rawBody = nodeRequest.body;
  } else {
    method = request.method;
  }

  const nodeResponse = response as NodeResponseLike | undefined;

  if (method !== "POST") {
    logger.error(`[EDGE-HANDLER] Méthode ${method} refusée.`);
    if (isNodeEnvironment) {
      nodeResponse!.status(405).send("Method Not Allowed");
      return;
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = (process.env["GEMINI_API_KEY"] as string | undefined) ?? "";
  if (!apiKey) {
    logger.error("[EDGE-HANDLER] ❌ CRITIQUE: La variable d'environnement GEMINI_API_KEY est introuvable sur Vercel !");
    const errorConfigPayload = JSON.stringify({ error: "GEMINI_API_KEY not configured" });
    if (isNodeEnvironment) {
      nodeResponse!.status(500).setHeader("Content-Type", "application/json").send(errorConfigPayload);
      return;
    }
    return new Response(errorConfigPayload, {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let params: GenerateMessageParams;
  try {
    if (isNodeEnvironment) {
      params = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    } else {
      params = (await (request as Request).json()) as GenerateMessageParams;
    }
    logger.debug("gemini", `[EDGE-HANDLER] Payload extrait pour le POI: "${params?.poiName}"`);
  } catch (jsonErr) {
    logger.error("[EDGE-HANDLER] Échec du parsing JSON du Body:", jsonErr);
    const errorJsonPayload = JSON.stringify({ error: "Invalid JSON body" });
    if (isNodeEnvironment) {
      nodeResponse!.status(400).setHeader("Content-Type", "application/json").send(errorJsonPayload);
      return;
    }
    return new Response(errorJsonPayload, {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { poiName, coords, poiTags } = params;

    logger.debug("gemini", "[EDGE-HANDLER] Étape 1: Lancement du prefetch Google Places...");
    const { googlePlacesData, toolsUsed } = await prefetchGooglePlaces({ poiName, coords, poiTags }, (args) => executeTool(GOOGLE_PLACES_TOOL_NAME, args));
    logger.debug("gemini", `[EDGE-HANDLER] Prefetch terminé. Outils initialisés: [${toolsUsed.join(", ")}]`);

    const userPrompt = buildEnrichedUserPrompt({ poiName, coords, poiTags }, googlePlacesData);
    const userContents: GeminiContent[] = [{ role: "user", parts: [{ text: userPrompt }] }];

    logger.debug("gemini", "[EDGE-HANDLER] Étape 2: Lancement du Tour 1 d'inférence à Google...");
    const data = await callWithRetry(apiKey, userContents, true);
    logger.debug("gemini", "[EDGE-HANDLER] Réponse du Tour 1 reçue.");

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const functionCallParts = parts.filter(
      (part): part is { functionCall: { name: string; args: Record<string, unknown> } & Record<string, unknown> } => "functionCall" in part
    );
    const functionCalls = functionCallParts.map((part) => part.functionCall);

    if (functionCalls.length > 0) {
      logger.debug(
        "gemini",
        `[EDGE-HANDLER] Étape 3: L'IA demande ${functionCalls.length} outil(s):`,
        functionCalls.map((c) => c.name)
      );

      const toolResults = await Promise.all(functionCalls.map((call) => executeTool(call.name, call.args)));
      functionCalls.forEach((call, index) => {
        markToolUsedIfUseful(toolsUsed, call.name, toolResults[index]);
      });

      logger.debug("gemini", "[EDGE-HANDLER] Outils exécutés. Injection dans l'historique...");

      const toolContents: GeminiContent[] = [
        ...userContents,
        {
          role: "model",
          parts: functionCallParts,
        },
        {
          role: "user",
          parts: functionCalls.map((call, index) => ({
            functionResponse: {
              id: typeof call["id"] === "string" ? call["id"] : undefined,
              name: call.name,
              response: { output: toolResults[index] },
            },
          })),
        },
      ];

      logger.debug("gemini", "[EDGE-HANDLER] Étape 4: Envoi du Tour 2 (Synthèse finale)...");
      const followUp = await callWithRetry(apiKey, toolContents, false);
      logger.debug("gemini", "[EDGE-HANDLER] Synthèse finale reçue.");

      const successPayload = JSON.stringify({ message: extractText(followUp), toolsUsed });
      if (isNodeEnvironment) {
        nodeResponse!.status(200).setHeader("Content-Type", "application/json").send(successPayload);
        return;
      }
      return new Response(successPayload, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    logger.debug("gemini", "[EDGE-HANDLER] Aucun outil demandé par l'IA. Renvoi direct.");
    const directPayload = JSON.stringify({ message: extractText(data), toolsUsed });
    if (isNodeEnvironment) {
      nodeResponse!.status(200).setHeader("Content-Type", "application/json").send(directPayload);
      return;
    }
    return new Response(directPayload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    logger.error("[EDGE-HANDLER] 🔥 CRASH GLOBAL SÉCURISÉ:", error);
    const errorPayload = JSON.stringify({
      error: `Gemini edge function failed`,
      details: error instanceof Error ? error.message : String(error),
    });

    if (isNodeEnvironment) {
      nodeResponse!.status(502).setHeader("Content-Type", "application/json").send(errorPayload);
      return;
    }
    return new Response(errorPayload, {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
