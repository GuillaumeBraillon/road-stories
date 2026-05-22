/**
 * Orchestrateur de requêtes et de session pour le SDK Google Gen AI.
 * Gère le cycle d'inférence interactif de l'agent : gestion des promesses,
 * boucles d'appels d'outils avec passage de contexte, et sérialisation structurée finale en JSON.
 * * @module services/gemini
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
    if (!apiKey) throw new Error("VITE_GEMINI_API_KEY non configurée.");
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

function logTokens(response: GenerateContentResponse): void {
  const meta = response.usageMetadata;
  if (!meta) return;
  logger.debug("gemini", `Tokens prompt : ${meta.promptTokenCount} | Réponse : ${meta.candidatesTokenCount} | Total : ${meta.totalTokenCount}`);
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
      logger.warn("gemini", `Échec d'appel de l'API (Tentative ${attempt + 1}/${RETRY_DELAYS_MS.length}). Reconnaissance dans ${delay}ms...`, error);
      await new Promise((res) => setTimeout(res, delay));
      attempt++;
    }
  }
}

export async function generateRoadMessage(params: GenerateMessageParams): Promise<GeminiResult> {
  const ai = getAI();
  const toolsUsed: string[] = [];

  logger.debug("gemini", `[START] Lancement prefetch Places pour : ${params.poiName}`);

  // 1. Optimisation réseau : Lancement du prefetch Google Places en parallèle
  const { googlePlacesData, toolsUsed: prefetchTools } = await prefetchGooglePlaces(
    params,
    async (args) => executeToolCall({ name: GOOGLE_PLACES_TOOL_NAME, args }, params.poiTags),
    (err) => logger.error("gemini", "Erreur lors du prefetch Google Places", err)
  );

  logger.debug("gemini", `[PREFETCH RESULT] Outils pré-activés : [${prefetchTools.join(", ")}] | Data présente : ${!!googlePlacesData}`);
  toolsUsed.push(...prefetchTools);

  // 2. Assemblage du prompt enrichi
  const userPrompt = buildEnrichedUserPrompt(params, googlePlacesData);
  logger.debug("gemini", `[PROMPT INITIAL SENT] :\n${userPrompt}`);

  const contents: Content[] = [{ role: "user", parts: [{ text: userPrompt }] }];

  // 3. Premier tour d'inférence de l'agent
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

  logTokens(response);

  let candidate = response.candidates?.[0];
  let parts = candidate?.content?.parts || [];
  let functionCalls = parts.filter(hasFunctionCall).map((p) => p.functionCall);

  let loops = 0;
  const MAX_LOOPS = 3;
  let hasExecutedTools = false;

  // 4. Branche réactive (Boucle multi-tours)
  while (functionCalls.length > 0 && loops < MAX_LOOPS) {
    hasExecutedTools = true;
    loops++;
    logger.debug("gemini", `[Tour Outil ${loops}] L'IA réclame ${functionCalls.length} outil(s) : ${functionCalls.map((c) => c.name).join(", ")}`);

    contents.push({ role: "model", parts });
    const toolResponseParts: Part[] = [];

    for (const call of functionCalls) {
      logger.debug("gemini", `[EXECUTE] Tool call: ${call.name}`, call.args);
      const toolResult = await executeToolCall(call, params.poiTags);

      logger.debug("gemini", `[EXECUTE RESULT] Réponse de l'outil ${call.name} (premiers caract.) : ${toolResult.substring(0, 80)}...`);
      markToolUsedIfUseful(toolsUsed, call.name, toolResult);

      toolResponseParts.push({
        functionResponse: {
          name: call.name,
          response: { result: toolResult },
        },
      });
    }

    contents.push({ role: "user", parts: toolResponseParts });

    // Ré-inférence
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

    if (functionCalls.length === 0 && response.text) {
      logger.debug("gemini", `[LOG TOURS INTERMÉDIAIRE] L'IA a arrêté les outils au tour ${loops}. Réponse brute textuelle intermédiaire : "${response.text}"`);
    }
  }

  // 5. Deuxième passe d'inférence : Synthèse textuelle et structuration JSON stricte
  if (hasExecutedTools || response.text) {
    logger.debug("gemini", "Envoi des résultats d'outils pour génération finale du JSON...");

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
              mode: FunctionCallingConfigMode.NONE, // Aucune fonction ne doit être appelée à ce stade, c'est la synthèse finale
            },
          },
        },
      })
    );

    logTokens(finalResponse);

    try {
      const parsedResult = JSON.parse(finalResponse.text ?? "{}");
      const actualToolsUsed = Array.isArray(parsedResult.actualToolsUsed) ? parsedResult.actualToolsUsed : [];
      return {
        message: parsedResult.message ?? "",
        toolsUsed: [...new Set([...toolsUsed, ...actualToolsUsed])],
      };
    } catch (err) {
      logger.error("gemini", "Échec du parsing JSON final, retour texte brut", err);
      return {
        message: finalResponse.text ?? "",
        toolsUsed,
      };
    }
  }

  return {
    message: response.text ?? "",
    toolsUsed,
  };
}
