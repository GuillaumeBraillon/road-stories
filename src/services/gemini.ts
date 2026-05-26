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
  return (await response.json()) as GeminiResult;
}
