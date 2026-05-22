/**
 * Orchestrateur de requêtes et de session pour le SDK Google Gen AI.
 * Version instrumentée pour le débug de production.
 * @module services/gemini
 */

import { FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";
import type { Content, FunctionCall, GenerateContentResponse, Part } from "@google/genai";
import { executeToolCall, toolDeclarations } from "./agentTools";
import { SYSTEM_PROMPT, JSON_CONSOLIDATION_INSTRUCTION, RESPONSE_JSON_SCHEMA } from "./prompts";
import { buildEnrichedUserPrompt, GOOGLE_PLACES_TOOL_NAME, markToolUsedIfUseful, prefetchGooglePlaces } from "./geminiShared";
import { logger } from "./logger";
import type { GeminiResult, GenerateMessageParams } from "../types/gemini.types";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!_ai) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    logger.debug("[SERVER-GEMINI] Tentative de lecture de la clé API...");
    if (!apiKey) {
      console.error("[SERVER-GEMINI] CRITIQUE: VITE_GEMINI_API_KEY est undefined ou vide !");
      throw new Error("VITE_GEMINI_API_KEY non configurée.");
    }
    logger.debug("[SERVER-GEMINI] Clé API trouvée (longueur:", apiKey.length, "). Initialisation du SDK GoogleGenAI...");
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

function logTokens(response: GenerateContentResponse): void {
  const meta = response.usageMetadata;
  if (!meta) return;
  logger.debug(`[SERVER-GEMINI] Usage Jetons -> Prompt: ${meta.promptTokenCount} | Réponse: ${meta.candidatesTokenCount} | Total: ${meta.totalTokenCount}`);
}

function hasFunctionCall(part: Part): part is Part & { functionCall: FunctionCall } {
  return typeof part === "object" && part !== null && "functionCall" in part && part.functionCall !== undefined;
}

async function retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length) throw error;
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`[SERVER-GEMINI] Échec d'appel API (Tentative ${attempt + 1}/${RETRY_DELAYS_MS.length}). Retentative dans ${delay}ms...`, error);
      await new Promise((res) => setTimeout(res, delay));
      attempt++;
    }
  }
}

export async function generateRoadMessage(params: GenerateMessageParams): Promise<GeminiResult> {
  logger.debug(`[SERVER-GEMINI] 🟢 Début generateRoadMessage pour le POI: "${params.poiName}"`);

  try {
    const ai = getAI();
    const toolsUsed: string[] = [];

    // 1. Lancement du prefetch Google Places
    logger.debug("[SERVER-GEMINI] Étape 1: Lancement du prefetch Places...");
    let googlePlacesData: string = "Non cherché";
    try {
      const prefetchResult = await prefetchGooglePlaces(
        params,
        async (args) => {
          logger.debug("[SERVER-GEMINI] Execution Tool Call via Prefetch:", args);
          return executeToolCall({ name: GOOGLE_PLACES_TOOL_NAME, args }, params.poiTags);
        },
        (err) => console.error("[SERVER-GEMINI] Erreur capturée dans le callback prefetch:", err)
      );
      googlePlacesData = prefetchResult.googlePlacesData;
      toolsUsed.push(...prefetchResult.toolsUsed);
      logger.debug("[SERVER-GEMINI] Prefetch Places terminé avec succès. Outils pré-activés:", prefetchResult.toolsUsed);
    } catch (prefetchError) {
      console.error("[SERVER-GEMINI] Crash non bloquant du bloc Prefetch Places:", prefetchError);
    }

    // 2. Assemblage du prompt enrichi
    logger.debug("[SERVER-GEMINI] Étape 2: Assemblage du prompt...");
    const userPrompt = buildEnrichedUserPrompt(params, googlePlacesData);
    const contents: Content[] = [{ role: "user", parts: [{ text: userPrompt }] }];

    // 3. Premier tour d'inférence
    logger.debug("[SERVER-GEMINI] Étape 3: Envoi du premier tour à Gemini (modèle:", GEMINI_MODEL, ")...");
    let response = await retryWithBackoff(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [toolDeclarations],
        },
      })
    );
    logger.debug("[SERVER-GEMINI] Premier tour d'inférence reçu.");
    logTokens(response);

    let candidate = response.candidates?.[0];
    let parts = candidate?.content?.parts || [];
    let functionCalls = parts.filter(hasFunctionCall).map((p) => p.functionCall);

    let loops = 0;
    const MAX_LOOPS = 3;
    let hasExecutedTools = false;

    // 4. Branche réactive (Boucle multi-tours d'outils)
    while (functionCalls.length > 0 && loops < MAX_LOOPS) {
      hasExecutedTools = true;
      loops++;
      logger.debug(
        `[SERVER-GEMINI] Étape 4 (Tour Boucle ${loops}): L'IA réclame ${functionCalls.length} outil(s):`,
        functionCalls.map((c) => c.name)
      );

      contents.push({ role: "model", parts });
      const toolResponseParts: Part[] = [];

      for (const call of functionCalls) {
        logger.debug(`[SERVER-GEMINI] Exécution de l'outil: ${call.name} avec args:`, call.args);
        try {
          const toolResult = await executeToolCall(call, params.poiTags);
          logger.debug(`[SERVER-GEMINI] Résultat de l'outil ${call.name} obtenu (Longueur: ${toolResult?.length})`);
          markToolUsedIfUseful(toolsUsed, call.name, toolResult);

          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              response: { result: toolResult },
            },
          });
        } catch (toolExecError) {
          console.error(`[SERVER-GEMINI] Erreur lors du processing de l'outil ${call.name}:`, toolExecError);
          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              response: { result: "Erreur interne de récupération de la donnée." },
            },
          });
        }
      }

      contents.push({ role: "user", parts: toolResponseParts });

      logger.debug(`[SERVER-GEMINI] Envoi des réponses d'outils à Gemini pour ré-inférence (Tour ${loops})...`);
      response = await retryWithBackoff(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [toolDeclarations],
          },
        })
      );
      logTokens(response);

      candidate = response.candidates?.[0];
      parts = candidate?.content?.parts || [];
      functionCalls = parts.filter(hasFunctionCall).map((p) => p.functionCall);
    }

    logger.debug("[SERVER-GEMINI] Sortie de la boucle d'outils.hasExecutedTools =", hasExecutedTools, "l'IA a-t-elle du texte ?", !!response.text);

    // 5. Consolidation et structuration JSON stricte
    if (hasExecutedTools || response.text) {
      logger.debug("[SERVER-GEMINI] Étape 5: Envoi pour structuration JSON finale contrôlée...");

      const finalResponse = await retryWithBackoff(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT + JSON_CONSOLIDATION_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_JSON_SCHEMA,
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.NONE, // Désactivation stricte de tout appel d'outil dans cette phase de consolidation finale
              },
            },
          },
        })
      );

      logTokens(finalResponse);
      const rawText = finalResponse.text;
      logger.debug("[SERVER-GEMINI] Texte brut reçu de la phase JSON:", rawText);

      try {
        const parsedResult = JSON.parse(rawText ?? "{}");
        logger.debug("[SERVER-GEMINI] Parsing JSON réussi.");
        const actualToolsUsed = Array.isArray(parsedResult.actualToolsUsed) ? parsedResult.actualToolsUsed : [];
        return {
          message: parsedResult.message ?? "",
          toolsUsed: [...new Set([...toolsUsed, ...actualToolsUsed])],
        };
      } catch (parseError) {
        console.error("[SERVER-GEMINI] Échec du parsing JSON du texte final. Fallback texte brut engagé.", parseError);
        return {
          message: rawText ?? "",
          toolsUsed,
        };
      }
    }

    logger.debug("[SERVER-GEMINI] Cas nominal direct sans passage d'outils.");
    return {
      message: response.text ?? "",
      toolsUsed,
    };
  } catch (globalError) {
    console.error("[SERVER-GEMINI] 🔥 CRASH TOTAL ET GLOBAL dans generateRoadMessage:", globalError);
    // On propage l'erreur pour que l'API route la capture et logue le contexte HTTP
    throw globalError;
  }
}
