import { GoogleGenAI } from "@google/genai";
import type { Content, FunctionCall, GenerateContentResponse } from "@google/genai";
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
    return (await response.json()) as GeminiResult; // Ton API devra renvoyer le format { message, toolsUsed }
  }

  const { poiName, coords, poiTags } = params;
  const userPrompt = buildUserPrompt(poiName, coords, poiTags);
  const toolsUsed: string[] = []; // On initialise le suivi des outils

  // 1er Tour d'appel à Gemini
  const response = await generateWithRetry({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: { systemInstruction: SYSTEM_PROMPT, tools: [toolDeclarations] },
  });

  logTokens(response);

  const functionCalls = response.functionCalls;
  if (functionCalls && functionCalls.length > 0) {
    const calls = functionCalls;

    // On enregistre les outils qui vont être exécutés
    calls.forEach((c) => {
      if (c.name) if (!toolsUsed.includes(c.name)) toolsUsed.push(c.name);
    });

    const toolResults = await Promise.all(calls.map((call: FunctionCall) => executeToolCall(call)));

    logger.debug(
      "gemini",
      `${calls.length} outil(s) appelé(s) :`,
      calls.map((c: FunctionCall) => c.name)
    );

    const contents: Content[] = [
      { role: "user", parts: [{ text: userPrompt }] },
      { role: "model", parts: calls.map((c: FunctionCall) => ({ functionCall: { name: c.name, args: c.args, id: c.id } })) },
      { role: "user", parts: calls.map((c: FunctionCall, i: number) => ({ functionResponse: { name: c.name, response: { output: toolResults[i] } } })) },
    ];

    // 2e Tour d'appel (avec les résultats des outils)
    const finalResponse = await generateWithRetry({
      model: GEMINI_MODEL,
      contents,
      config: { systemInstruction: SYSTEM_PROMPT },
    });

    logTokens(finalResponse);
    return {
      message: finalResponse.text ?? "",
      toolsUsed,
    };
  }

  return {
    message: response.text ?? "",
    toolsUsed: [],
  };
}
