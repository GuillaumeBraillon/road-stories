import type { GeminiResult, GenerateMessageParams } from "../types/gemini.types";

/**
 * Génère un message audio culturel via l'API Edge /api/gemini.
 * Fonctionne identiquement en dev (vercel dev) et en production.
 */
export async function generateRoadMessage(params: GenerateMessageParams): Promise<GeminiResult> {
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API ${response.status}: ${body}`);
  }

  return (await response.json()) as GeminiResult;
}
