/**
 * Vercel Edge Function — Gemini AI
/**
 * Vercel Edge Function — Gemini AI
 *
 * Implémentation via l'API REST Gemini (fetch natif) — aucune dépendance npm.
 * Compatible Vercel Edge Runtime. La clé GEMINI_API_KEY reste côté serveur.
 *
 * — Point d'entrée principal pour la génération de messages audio culturels via Gemini
 * — Orchestration de l'appel Gemini, gestion des outils, prompt système, et enrichissement
 */

import { toolDeclarations, executeTool } from "./tools/index";
import { SYSTEM_PROMPT } from "../src/services/prompts";
import { buildEnrichedUserPrompt, GOOGLE_PLACES_TOOL_NAME, markToolUsedIfUseful, prefetchGooglePlaces } from "../src/services/geminiShared";
import type { GenerateMessageParams } from "../src/types/gemini.types";

/**
 * Modèle Gemini utilisé pour la génération (version flash-lite).
 */
const GEMINI_MODEL = "gemini-3.1-flash-lite";
/**
 * URL de base de l'API Gemini REST.
 */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
/**
 * Structure d'une partie de contenu Gemini (texte, appel d'outil, ou réponse d'outil).
 */
type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } & Record<string, unknown> }
  | { functionResponse: { id?: string; name: string; response: { output: string } } };

/**
 * Structure d'un message Gemini (utilisateur ou modèle).
 */
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

/**
 * Structure de la réponse API Gemini.
 */
interface GeminiApiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { code: number; message: string };
}

/**
 * Extrait le texte généré par Gemini à partir de la réponse API.
 * @param data Réponse brute Gemini
 * @returns Texte généré ou chaîne vide
 */
function extractText(data: GeminiApiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p): p is { text: string } => "text" in p);
  return textPart?.text ?? "";
}

/**
 * Appelle l'API Gemini REST pour générer du contenu, avec ou sans outils.
 * @param apiKey Clé API Gemini (cachée côté serveur)
 * @param contents Messages utilisateur/modèle à transmettre
 * @param withTools Active ou non les outils Gemini
 * @returns Réponse brute Gemini
 * @throws Error en cas d'erreur API
 */
async function callGeminiAPI(apiKey: string, contents: GeminiContent[], withTools: boolean): Promise<GeminiApiResponse> {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    ...(withTools ? { tools: [{ function_declarations: toolDeclarations.functionDeclarations }] } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as GeminiApiResponse;
  if (data.error) throw new Error(`Gemini ${data.error.code}: ${data.error.message}`);
  return data;
}

/**
 * Délais de retry (ms) en cas d'échec temporaire Gemini.
 */
const RETRY_DELAYS_MS = [1_000, 2_000];

/**
 * Appelle Gemini avec retry automatique sur erreurs réseau/serveur.
 * @param apiKey Clé API Gemini
 * @param contents Messages à transmettre
 * @param withTools Active les outils Gemini
 * @returns Réponse Gemini
 */
async function callWithRetry(apiKey: string, contents: GeminiContent[], withTools: boolean): Promise<GeminiApiResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1] as number));
    }
    try {
      return await callGeminiAPI(apiKey, contents, withTools);
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = (process.env["GEMINI_API_KEY"] as string | undefined) ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let params: GenerateMessageParams;
  try {
    params = (await request.json()) as GenerateMessageParams;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { poiName, coords, poiTags } = params;
  const { googlePlacesData, toolsUsed } = await prefetchGooglePlaces({ poiName, coords, poiTags }, (args) => executeTool(GOOGLE_PLACES_TOOL_NAME, args));
  const userPrompt = buildEnrichedUserPrompt({ poiName, coords, poiTags }, googlePlacesData);

  const userContents: GeminiContent[] = [{ role: "user", parts: [{ text: userPrompt }] }];

  try {
    const data = await callWithRetry(apiKey, userContents, true);

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const functionCallParts = parts.filter(
      (part): part is { functionCall: { name: string; args: Record<string, unknown> } & Record<string, unknown> } => "functionCall" in part
    );
    const functionCalls = functionCallParts.map((part) => part.functionCall);

    if (functionCalls.length > 0) {
      const toolResults = await Promise.all(functionCalls.map((call) => executeTool(call.name, call.args)));
      functionCalls.forEach((call, index) => {
        markToolUsedIfUseful(toolsUsed, call.name, toolResults[index]);
      });

      const toolContents: GeminiContent[] = [
        ...userContents,
        {
          role: "model",
          // Important: conserver les functionCall bruts renvoyés par Gemini (thought_signature, etc.).
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
      const followUp = await callGeminiAPI(apiKey, toolContents, false);
      return new Response(JSON.stringify({ message: extractText(followUp), toolsUsed }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: extractText(data), toolsUsed }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: `Gemini failed: ${message}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
