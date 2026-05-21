import { GoogleGenAI } from "@google/genai";
import type { Content, FunctionCall, GenerateContentResponse, Part } from "@google/genai";
import { executeToolCall, toolDeclarations } from "./agentTools";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts"; // On importe les prompts d'ici !
import { logger } from "./logger";
import type { GeminiResult } from "../types";

export interface GenerateMessageParams {
  poiName: string;
  coords: { lat: number; lng: number };
  poiTags: Record<string, string>;
}

//Gemini 2.5 Flash : 'gemini-2.5-flash'
//Gemini 3.1 Flash Lite : 'gemini-3.1-flash-lite'
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  return _ai;
}

function logTokens(response: GenerateContentResponse): void {
  const meta = response.usageMetadata;
  if (!meta) return;
  logger.debug("gemini", `Tokens prompt : ${meta.promptTokenCount} | Réponse : ${meta.candidatesTokenCount} | Total : ${meta.totalTokenCount}`);
}

function hasFunctionCall(part: Part): part is Part & { functionCall: FunctionCall } {
  return !!part.functionCall;
}

type FunctionCallPart = Part & { functionCall: FunctionCall };

function isUsefulToolResult(result: string | undefined): result is string {
  if (!result) return false;
  return (
    result !== "Non disponible" &&
    result !== "Informations Google Places non disponibles pour ce lieu" &&
    !result.startsWith("Erreur") &&
    !result.startsWith("Arguments manquants")
  );
}

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

export async function generateRoadMessage(params: GenerateMessageParams): Promise<GeminiResult> {
  if (!import.meta.env.DEV) {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error(`Gemini Edge Function error: ${response.status}`);
    return (await response.json()) as GeminiResult;
  }

  const { poiName, coords, poiTags } = params;
  const toolsUsed: string[] = [];
  let googlePlacesData = "Non cherché";

  const isEstablishment = !!(poiTags["amenity"] || poiTags["shop"] || poiTags["tourism"] || poiTags["craft"]);
  if (isEstablishment) {
    try {
      const result = await executeToolCall({
        name: "getPlaceDetails",
        args: { name: poiName, lat: coords.lat, lng: coords.lng },
      });

      if (isUsefulToolResult(result)) {
        googlePlacesData = result;
        toolsUsed.push("getPlaceDetails");
      } else {
        googlePlacesData = result || "Non disponible";
      }
    } catch (error) {
      logger.error("gemini", "Échec du pré-fetch Google Places", error);
    }
  }

  let userPrompt = buildUserPrompt(poiName, coords, poiTags);
  userPrompt += `\n\nDonnées Google Places réelles trouvées : ${googlePlacesData}`;
  userPrompt += "\nNote: Si un avis marquant ou une excellente note est présent, intègre-le de manière naturelle dans ton récit.";

  // On ajoute une consigne de rigueur incontournable pour les œuvres d'art
  if (poiTags["tourism"] === "artwork" || poiTags["artwork_type"]) {
    userPrompt += `\n\n⚠️ CONSIGNES IMPÉRATIVES POUR CETTE ŒUVRE D'ART :
- Si le tag 'artist_name' est présent (${poiTags["artist_name"] || "non"}), tu DOIS obligatoirement citer le nom de l'artiste dans ton récit.
- Si le tag 'material' est présent (${poiTags["material"] || "non"}), tu DOIS obligatoirement mentionner le matériau utilisé (ex: métal, bronze, pierre).`;
  }

  // 1er Tour d'appel à Gemini (Inchangé)
  const response = await generateWithRetry({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: { systemInstruction: SYSTEM_PROMPT, tools: [toolDeclarations] },
  });

  logTokens(response);

  const functionCalls = response.functionCalls;
  if (functionCalls && functionCalls.length > 0) {
    const rawFunctionCallParts = response.candidates?.[0]?.content?.parts?.filter(hasFunctionCall) ?? [];
    const functionCallParts: FunctionCallPart[] =
      rawFunctionCallParts.length > 0 ? rawFunctionCallParts : functionCalls.map((call) => ({ functionCall: call }));
    const calls = functionCallParts.map((part) => part.functionCall);

    // On exécute les outils
    const toolResults = await Promise.all(calls.map((call: FunctionCall) => executeToolCall(call)));

    logger.debug(
      "gemini",
      `${calls.length} outil(s) appelé(s) :`,
      calls.map((c: FunctionCall) => c.name)
    );

    calls.forEach((call, index) => {
      if (call.name && isUsefulToolResult(toolResults[index]) && !toolsUsed.includes(call.name)) {
        toolsUsed.push(call.name);
      }
    });

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

    // 2e Tour d'appel : On force la réponse en JSON structuré
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

    // Extraction et parsing sécurisé du JSON de Gemini
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

  return {
    message: response.text ?? "",
    toolsUsed,
  };
}
