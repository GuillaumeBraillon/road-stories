/**
 * Vercel Edge Function — Gemini AI
 *
 * Implémentation via l'API REST Gemini (fetch natif) — aucune dépendance npm.
 * Compatible Vercel Edge Runtime. La clé GEMINI_API_KEY reste côté serveur.
 */

export const config = { runtime: "edge" };

import { toolDeclarations, executeTool } from "./tools/index";
import { SYSTEM_PROMPT, buildUserPrompt } from "../src/services/prompts";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GenerateMessageParams {
  poiName: string;
  coords: { lat: number; lng: number };
  poiTags: Record<string, string>;
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } & Record<string, unknown> }
  | { functionResponse: { id?: string; name: string; response: { output: string } } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

interface GeminiApiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { code: number; message: string };
}

function extractText(data: GeminiApiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p): p is { text: string } => "text" in p);
  return textPart?.text ?? "";
}

function isUsefulToolResult(result: string | undefined): result is string {
  if (!result) return false;
  return (
    result !== "Non disponible" &&
    result !== "Informations Google Places non disponibles pour ce lieu" &&
    !result.startsWith("Erreur") &&
    !result.startsWith("Arguments manquants")
  );
}

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

const RETRY_DELAYS_MS = [1_000, 2_000];

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
  const toolsUsed: string[] = [];
  let googlePlacesData = "Non cherché";

  const isEstablishment = !!(poiTags["amenity"] || poiTags["shop"] || poiTags["tourism"] || poiTags["craft"]);
  if (isEstablishment) {
    try {
      const result = await executeTool("getPlaceDetails", { name: poiName, lat: coords.lat, lng: coords.lng });
      if (isUsefulToolResult(result)) {
        googlePlacesData = result;
        toolsUsed.push("getPlaceDetails");
      } else {
        googlePlacesData = result || "Non disponible";
      }
    } catch {
      googlePlacesData = "Non disponible";
    }
  }

  let userPrompt = buildUserPrompt(poiName, coords, poiTags);
  userPrompt += `\n\nDonnées Google Places réelles trouvées : ${googlePlacesData}`;
  userPrompt += "\nNote: Si un avis marquant ou une excellente note est présent, intègre-le de manière naturelle dans ton récit.";

  if (poiTags["tourism"] === "artwork" || poiTags["artwork_type"]) {
    userPrompt += `\n\nCONSIGNES IMPÉRATIVES POUR CETTE ŒUVRE D'ART :
- Si le tag 'artist_name' est présent (${poiTags["artist_name"] || "non"}), tu DOIS obligatoirement citer le nom de l'artiste dans ton récit.
- Si le tag 'material' est présent (${poiTags["material"] || "non"}), tu DOIS obligatoirement mentionner le matériau utilisé (ex: métal, bronze, pierre).`;
  }

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
        if (call.name && isUsefulToolResult(toolResults[index]) && !toolsUsed.includes(call.name)) {
          toolsUsed.push(call.name);
        }
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
