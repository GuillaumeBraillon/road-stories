import type { GeminiResult, GenerateMessageParams } from "../types/gemini.types";
import { logger } from "./logger";

/**
 * Génère un message audio culturel via l'API Edge /api/gemini.
 * Fonctionne identiquement en dev (vercel dev) et en production.
 */
export async function generateRoadMessage(params: GenerateMessageParams): Promise<GeminiResult> {
  logger.debug("gemini SERVICE", "Envoi de la requête de génération de message à l'API Edge /api/gemini avec les paramètres suivants:", params);
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API ${response.status}: ${body}`);
  }

  logger.debug("gemini SERVICE", "Réponse reçue de l'API Gemini, parsing du résultat...");
  const rawData = await response.json();

  // 🎯 Sécurité de mapping entre le schéma de l'API (prompts.ts) et tes types UI (gemini.types.ts)
  return {
    message: rawData.message || "",
    refinedTitle: rawData.refinedTitle || rawData.title || undefined,
    toolsUsed: rawData.actualToolsUsed || rawData.toolsUsed || [],
  };
}
