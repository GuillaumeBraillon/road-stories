/**
 * Vercel Edge Function — Gemini AI
 *
 * Implémentation via l'API REST Gemini (fetch natif) — aucune dépendance npm.
 * Compatible Vercel Edge Runtime. La clé GEMINI_API_KEY reste côté serveur.
 *
 * — Point d'entrée principal pour la génération de messages audio culturels via Gemini
 * — Orchestration de l'appel Gemini, gestion des outils, prompt système, et enrichissement
 */

export const config = { runtime: "edge" };

import { toolDeclarations, executeTool } from "./tools/index";
import { SYSTEM_PROMPT, JSON_CONSOLIDATION_INSTRUCTION, RESPONSE_JSON_SCHEMA, buildUserPrompt } from "../src/services/prompts";
import type { GenerateMessageParams } from "../src/types/gemini.types";
import { logger } from "./logger.js";

/**
 * Modèle Gemini utilisé pour la génération (version flash-lite).
 */
const GEMINI_MODEL = "gemini-3.1-flash-lite";
/**
 * URL de base de l'API Gemini REST.
 */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRY_DELAYS_MS = [1_000, 2_000];
const GOOGLE_PLACES_TOOL_NAME = "getPlaceDetails";

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

interface GeminiCallConfig {
  systemInstruction: string;
  withTools?: boolean;
  responseMimeType?: string;
  responseSchema?: unknown;
}

// --- Helpers inlinés (anciennement geminiShared) ---

function isUsefulToolResult(result: string | undefined): result is string {
  if (!result) return false;
  return (
    result !== "Non disponible" &&
    result !== "Informations Google Places non disponibles pour ce lieu" &&
    !result.startsWith("Erreur") &&
    !result.startsWith("Arguments manquants")
  );
}

function markToolUsedIfUseful(toolsUsed: string[], toolName: string | undefined, result: string | undefined): void {
  if (toolName && isUsefulToolResult(result) && !toolsUsed.includes(toolName)) {
    toolsUsed.push(toolName);
  }
}

function shouldPrefetchGooglePlaces(poiTags: Record<string, string>): boolean {
  return !!(poiTags["amenity"] || poiTags["shop"] || poiTags["tourism"] || poiTags["craft"]);
}

async function prefetchGooglePlaces(params: GenerateMessageParams): Promise<{ googlePlacesData: string; toolsUsed: string[] }> {
  const toolsUsed: string[] = [];

  if (!shouldPrefetchGooglePlaces(params.poiTags)) {
    return { googlePlacesData: "Non cherché", toolsUsed };
  }

  try {
    const result = await executeTool(GOOGLE_PLACES_TOOL_NAME, {
      name: params.poiName,
      lat: params.coords.lat,
      lng: params.coords.lng,
    });
    markToolUsedIfUseful(toolsUsed, GOOGLE_PLACES_TOOL_NAME, result);
    return { googlePlacesData: result || "Non disponible", toolsUsed };
  } catch {
    return { googlePlacesData: "Non disponible", toolsUsed };
  }
}

function buildEnrichedUserPrompt(params: GenerateMessageParams, googlePlacesData: string): string {
  let userPrompt = buildUserPrompt(params.poiName, params.coords, params.poiTags);
  userPrompt += `\n\nDonnées Google Places réelles trouvées : ${googlePlacesData}`;
  userPrompt += "\nNote: Si un avis marquant ou une excellente note est présent, intègre-le de manière naturelle dans ton récit.";

  if (params.poiTags["tourism"] === "artwork" || params.poiTags["artwork_type"]) {
    userPrompt += `\n\nCONSIGNES IMPÉRATIVES POUR CETTE ŒUVRE D'ART :
- Si le tag 'artist_name' est présent (${params.poiTags["artist_name"] || "non"}), tu DOIS obligatoirement citer le nom de l'artiste dans ton récit.
- Si le tag 'material' est présent (${params.poiTags["material"] || "non"}), tu DOIS obligatoirement mentionner le matériau utilisé (ex: métal, bronze, pierre).`;
  }

  return userPrompt;
}

// --- API Gemini ---
/**
 * Extrait le texte généré par Gemini à partir de la réponse API.
 * @param data Réponse brute Gemini
 * @returns Texte généré ou chaîne vide
 */
function extractText(data: GeminiApiResponse): string {
  logger.debug("gemini API", "Extraction du texte généré à partir de la réponse Gemini...");
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
async function callGeminiAPI(apiKey: string, contents: GeminiContent[], config: GeminiCallConfig): Promise<GeminiApiResponse> {
  logger.debug("gemini API", `Modèle Gemini utilisé : ${GEMINI_MODEL}`);
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  logger.debug("gemini API", `Calling Gemini API with tools: ${config.withTools ? "enabled" : "disabled"}`);
  const body = {
    system_instruction: { parts: [{ text: config.systemInstruction }] },
    contents,
    ...(config.withTools ? { tools: [{ function_declarations: toolDeclarations.functionDeclarations }] } : {}),
    ...(config.responseMimeType ? { generationConfig: { responseMimeType: config.responseMimeType, responseSchema: config.responseSchema } } : {}),
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
 * Appelle Gemini avec retry automatique sur erreurs réseau/serveur.
 * @param apiKey Clé API Gemini
 * @param contents Messages à transmettre
 * @param withTools Active les outils Gemini
 * @returns Réponse Gemini
 */
async function callWithRetry(apiKey: string, contents: GeminiContent[], config: GeminiCallConfig): Promise<GeminiApiResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    logger.debug("gemini API", `Attempt ${attempt + 1} of ${RETRY_DELAYS_MS.length + 1}`);
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1] as number));
    }
    try {
      return await callGeminiAPI(apiKey, contents, config);
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

// --- Handler ---

export default async function handler(request: Request): Promise<Response> {
  logger.debug("gemini API", "📥 Nouvelle requête reçue sur le proxy Gemini.");
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const apiKey = (process.env["GEMINI_API_KEY"] as string | undefined) ?? "";
  logger.debug("gemini API", `GEMINI_API_KEY is ${apiKey ? "configured" : "missing"}`);

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

  try {
    // 1. Prefetch Google Places si le POI est éligible
    logger.debug("gemini API", `Démarrage du préfetch Google Places pour le POI: ${params.poiName}`);
    const { googlePlacesData, toolsUsed } = await prefetchGooglePlaces(params);

    // 2. Construction du prompt enrichi
    logger.debug("gemini API", "Construction du prompt utilisateur enrichi avec les données préfetchées...");
    const userPrompt = buildEnrichedUserPrompt(params, googlePlacesData);
    const contents: GeminiContent[] = [{ role: "user", parts: [{ text: userPrompt }] }];

    // 3. Premier tour — avec outils
    logger.debug("gemini API", "Premier appel à Gemini avec outils activés...");
    const data = await callWithRetry(apiKey, contents, {
      systemInstruction: SYSTEM_PROMPT,
      withTools: true,
    });

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const functionCallParts = parts.filter(
      (part): part is { functionCall: { name: string; args: Record<string, unknown> } & Record<string, unknown> } => "functionCall" in part
    );
    const functionCalls = functionCallParts.map((part) => part.functionCall);

    // 4. Si Gemini a appelé des outils → second tour de consolidation JSON
    logger.debug("gemini API", `Gemini a effectué ${functionCalls.length} appels d'outils.`);
    if (functionCalls.length > 0) {
      const toolResults = await Promise.all(functionCalls.map((call) => executeTool(call.name, call.args)));

      functionCalls.forEach((call, index) => {
        markToolUsedIfUseful(toolsUsed, call.name, toolResults[index]);
      });

      const toolContents: GeminiContent[] = [
        ...contents,
        {
          role: "model",
          // Conserver les functionCall bruts renvoyés par Gemini (thought_signature, etc.)
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

      // Second tour : consolidation JSON stricte, outils désactivés
      logger.debug("gemini API", "Lancement du second appel à Gemini pour consolidation JSON, avec les résultats d'outils...");
      const followUp = await callWithRetry(apiKey, toolContents, {
        systemInstruction: SYSTEM_PROMPT + JSON_CONSOLIDATION_INSTRUCTION,
        withTools: false,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_JSON_SCHEMA,
      });

      const followUpText = extractText(followUp) ?? "{}";

      try {
        const cleanJsonText = followUpText
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        const parsed = JSON.parse(cleanJsonText);

        logger.debug("gemini API", "Texte de consolidation JSON extrait de Gemini:", parsed);
        const actualToolsUsed = Array.isArray(parsed.actualToolsUsed) ? parsed.actualToolsUsed : [];

        return new Response(
          JSON.stringify({
            message: parsed.message ?? "",
            refinedTitle: parsed.refinedTitle ?? undefined,
            toolsUsed: [...new Set([...toolsUsed, ...actualToolsUsed])],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        logger.error("gemini API", "Échec du parsing JSON au second tour, fallback RegExp de secours", error);

        const messageMatch = followUpText.match(/"message"\s*:\s*"([\s\S]*?)"/);
        const titleMatch = followUpText.match(/"refinedTitle"\s*:\s*"([\s\S]*?)"/);

        return new Response(
          JSON.stringify({
            message: messageMatch ? messageMatch[1] : followUpText,
            refinedTitle: titleMatch ? titleMatch[1] : undefined,
            toolsUsed,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Cas nominal : pas de tool call, retour direct
    logger.debug("gemini API", "Aucun appel d'outil effectué par Gemini, retour du message généré directement.");
    logger.debug("gemini API", "Contenu brut de la réponse Gemini:", data);
    const rawText = extractText(data);
    logger.debug("gemini API", "Texte brut extrait de la réponse Gemini:", rawText);

    try {
      const cleanJsonText = rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsed = JSON.parse(cleanJsonText);
      logger.debug("gemini API", "Texte JSON parsé avec succès sans outils:", parsed);

      return new Response(
        JSON.stringify({
          message: parsed.text ?? parsed.content ?? parsed.message ?? "",
          refinedTitle: parsed.refinedTitle ?? undefined,
          toolsUsed,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      logger.error("gemini API", "Échec du parsing JSON sans outils", error);

      return new Response(
        JSON.stringify({
          message: rawText,
          refinedTitle: undefined,
          toolsUsed,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: `Gemini failed: ${message}` }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
}
