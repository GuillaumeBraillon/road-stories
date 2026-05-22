/**
 * Service principal d'orchestration Gemini pour Road Stories
 *
 * - Initialise et gère l'agent Gemini
 * - Prépare les prompts utilisateur enrichis
 * - Gère les appels d'outils (tool use)
 * - Gère les retries, le logging, le parsing JSON
 * - Exporte la fonction unique generateRoadMessage
 */
import { GoogleGenAI } from "@google/genai";
import type { Content, FunctionCall, GenerateContentResponse, Part } from "@google/genai";
import { executeToolCall, toolDeclarations } from "./agentTools";
import { SYSTEM_PROMPT } from "./prompts";
import { buildEnrichedUserPrompt, GOOGLE_PLACES_TOOL_NAME, markToolUsedIfUseful, prefetchGooglePlaces } from "./geminiShared";
import { logger } from "./logger";
import type { GeminiResult, GenerateMessageParams } from "../types/gemini.types";

/**
 * Modèle Gemini utilisé (voir doc Google)
 * 'gemini-2.5-flash' ou 'gemini-3.1-flash-lite'
 */
const GEMINI_MODEL = "gemini-3.1-flash-lite";

/**
 * Délais de retry en ms pour les appels Gemini (backoff)
 */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

let _ai: GoogleGenAI | null = null;
/**
 * Singleton d'initialisation de l'API Gemini
 * @returns Instance GoogleGenAI
 */
function getAI(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  return _ai;
}

/**
 * Logge le nombre de tokens utilisés par Gemini (pour debug/dev)
 * @param response Réponse Gemini
 */
function logTokens(response: GenerateContentResponse): void {
  const meta = response.usageMetadata;
  if (!meta) return;
  logger.debug("gemini", `Tokens prompt : ${meta.promptTokenCount} | Réponse : ${meta.candidatesTokenCount} | Total : ${meta.totalTokenCount}`);
}

/**
 * Type guard pour détecter les parties contenant un functionCall Gemini
 */
function hasFunctionCall(part: Part): part is Part & { functionCall: FunctionCall } {
  return !!part.functionCall;
}

/**
 * Type utilitaire pour les parties Gemini contenant un functionCall
 */
type FunctionCallPart = Part & { functionCall: FunctionCall };

/**
 * Appelle Gemini avec gestion du retry/backoff sur erreurs réseau
 * @param params Paramètres d'appel Gemini
 * @returns Réponse Gemini
 */
async function generateWithRetry(
  params: Parameters<InstanceType<typeof GoogleGenAI>["models"]["generateContent"]>[0]
): ReturnType<InstanceType<typeof GoogleGenAI>["models"]["generateContent"]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    try {
      return await getAI().models.generateContent(params);
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) throw error; // Rate limit immédiat
      if (error instanceof Error && error.message.includes("400")) {
        logger.error("gemini", "Erreur Gemini 400:", error.message);
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Fonction principale d'orchestration Gemini pour générer un message Road Stories
 *
 * - Préfetch Google Places si besoin
 * - Génère le prompt utilisateur enrichi
 * - Appelle Gemini (1 ou 2 tours selon tool use)
 * - Gère le parsing JSON structuré
 * - Retourne le message final et la liste des outils réellement utilisés
 *
 * @param params Paramètres métier (POI, coordonnées, tags)
 * @returns GeminiResult { message, toolsUsed }
 */
export async function generateRoadMessage(params: GenerateMessageParams): Promise<GeminiResult> {
  // --- Mode production : délégation à l'API edge (Vercel) ---
  if (!import.meta.env.DEV) {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error(`Gemini Edge Function error: ${response.status}`);
    return (await response.json()) as GeminiResult;
  }

  // --- Mode développement : tout est exécuté côté client ---

  // 1. Préparation des données utilisateur (POI, coordonnées, tags)
  const { poiName, coords, poiTags } = params;

  // 2. Pré-fetch Google Places si le POI est éligible (pour enrichir le prompt)
  const { googlePlacesData, toolsUsed } = await prefetchGooglePlaces(
    { poiName, coords, poiTags },
    (args) => executeToolCall({ name: GOOGLE_PLACES_TOOL_NAME, args }),
    (error) => logger.error("gemini", "Échec du pré-fetch Google Places", error)
  );

  // 3. Construction du prompt utilisateur enrichi (tags OSM + Google Places)
  const userPrompt = buildEnrichedUserPrompt({ poiName, coords, poiTags }, googlePlacesData);

  // 4. Premier appel Gemini (prompt utilisateur, outils déclarés)
  const response = await generateWithRetry({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: { systemInstruction: SYSTEM_PROMPT, tools: [toolDeclarations] },
  });

  logTokens(response); // Affiche le nombre de tokens consommés

  // 5. Si Gemini déclenche un ou plusieurs tool calls (functionCalls)
  const functionCalls = response.functionCalls;
  if (functionCalls && functionCalls.length > 0) {
    // a. On récupère les parties contenant les appels d'outils
    const rawFunctionCallParts = response.candidates?.[0]?.content?.parts?.filter(hasFunctionCall) ?? [];
    const functionCallParts: FunctionCallPart[] =
      rawFunctionCallParts.length > 0 ? rawFunctionCallParts : functionCalls.map((call) => ({ functionCall: call }));
    const calls = functionCallParts.map((part) => part.functionCall);

    // b. Exécution de tous les outils demandés par Gemini
    const toolResults = await Promise.all(calls.map((call: FunctionCall) => executeToolCall(call)));

    logger.debug(
      "gemini",
      `${calls.length} outil(s) appelé(s) :`,
      calls.map((c: FunctionCall) => c.name)
    );

    // c. Marquage des outils réellement utiles (pour l'historique)
    calls.forEach((call, index) => {
      markToolUsedIfUseful(toolsUsed, call.name, toolResults[index]);
    });

    // d. Construction du contexte pour le second tour Gemini (tool use -> réponse finale)
    const contents: Content[] = [
      { role: "user", parts: [{ text: userPrompt }] },
      { role: "model", parts: functionCallParts },
      {
        role: "user",
        parts: calls.map((c: FunctionCall, i: number) => ({
          functionResponse: { id: c.id, name: c.name, response: { output: toolResults[i] } },
        })),
      },
    ];

    // e. Second appel Gemini : on force la réponse en JSON structuré
    const finalResponse = await generateWithRetry({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction:
          SYSTEM_PROMPT +
          "\nTu dois obligatoirement répondre sous forme d'un objet JSON contenant 'message' et 'actualToolsUsed'. Si les données d'un outil étaient hors-sujet (ex: homonyme), exclus cet outil de la liste.",
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            message: {
              type: "STRING",
              description: "Le récit fluide du lieu. Inclus impérativement l'artiste et les matériaux s'ils sont fournis dans les tags OSM.",
            },
            actualToolsUsed: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "Les noms des outils (ex: 'getWikipediaSummary') dont les infos ont été VRAIMENT utiles pour rédiger le message.",
            },
          },
          required: ["message", "actualToolsUsed"],
        },
      },
    });

    logTokens(finalResponse);

    // f. Parsing sécurisé du JSON retourné par Gemini
    try {
      const parsedResult = JSON.parse(finalResponse.text ?? "{}");
      const actualToolsUsed = Array.isArray(parsedResult.actualToolsUsed) ? parsedResult.actualToolsUsed : [];
      return {
        message: parsedResult.message ?? "",
        toolsUsed: [...new Set([...toolsUsed, ...actualToolsUsed])],
      };
    } catch (error) {
      logger.error("gemini", "Erreur lors du parsing JSON de la réponse Gemini, fallback appliqué.", error);
      // Fallback au cas où le JSON échouerait (très rare avec Flash 3.1)
      return {
        message: finalResponse.text ?? "",
        toolsUsed,
      };
    }
  }

  // 6. Cas nominal : pas de tool call, on retourne la réponse brute
  return {
    message: response.text ?? "",
    toolsUsed,
  };
}
