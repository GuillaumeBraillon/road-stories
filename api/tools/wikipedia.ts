/**
 * Outil serveur d'extraction de résumés Wikipédia.
 * Communique avec l'API officielle REST de Wikipédia pour obtenir des introductions épurées.
 * * @module api/tools/wikipedia
 */

import { Type } from "@google/genai";

/**
 * Déclaration OpenAPI-like de l'outil destinée au Function Calling de l'API Gemini.
 */
export const declaration = {
  name: "getWikipediaSummary",
  description: "Récupère le résumé Wikipedia en français d'un lieu à partir de son titre exact ou de son slug.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "Le titre exact de la page Wikipédia (ex: 'Pont du Gard').",
      },
    },
    required: ["title"],
  },
};

/**
 * URL de l'API REST de Wikipédia dédiée aux résumés de pages.
 */
const WIKIPEDIA_REST_URL = "https://fr.wikipedia.org/api/rest_v1/page/summary";

/**
 * Limite de temps maximum allouée pour la requête HTTP (ms).
 */
const TIMEOUT_MS = 5_000;

/**
 * Contrat d'interface décrivant la structure attendue de la réponse REST de Wikipédia.
 */
interface WikipediaRestSummary {
  type?: string;
  extract?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
}

/**
 * Exécute l'appel réseau vers l'API Wikipédia pour extraire le résumé d'un titre donné.
 * Gère une double tentative (casse brute puis minuscules) et élimine les homonymies.
 * * @param {Record<string, unknown>} args - Arguments transmis par l'appel de fonction de Gemini.
 * @param {unknown} args.title - Titre de la page Wikipédia cible.
 * @returns {Promise<string>} Le résumé textuel ou la chaîne standardisée "Non disponible".
 */
export async function execute(args: Record<string, unknown>): Promise<string> {
  const title = String(args["title"] ?? "").trim();
  if (!title) {
    return "Arguments manquants pour l'appel de fonction";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  /**
   * Effectue la requête HTTP vers l'endpoint REST Summary de Wikipédia.
   */
  async function queryApi(pageTitle: string, signal: AbortSignal): Promise<string | null | "not-found"> {
    const slug = pageTitle.replace(/ /g, "_");
    try {
      const response = await fetch(`${WIKIPEDIA_REST_URL}/${encodeURIComponent(slug)}`, { signal });
      if (response.status === 404) return "not-found";
      if (!response.ok) return null;

      const data = (await response.json()) as WikipediaRestSummary;
      if (data.type === "disambiguation") return null; // Ignore les pages d'homonymie
      if (!data.coordinates) return null; // Filtre les entités non géolocalisées

      return data.extract ?? null;
    } catch {
      return null;
    }
  }

  try {
    // 1ère tentative : Respect de la casse OpenStreetMap
    const firstAttempt = await queryApi(title, controller.signal);
    if (firstAttempt !== "not-found" && firstAttempt !== null) return firstAttempt;

    // 2e tentative de repli : Tout en minuscules (gestion des erreurs de saisie)
    const lowerTitle = title.toLowerCase();
    if (lowerTitle !== title) {
      const secondAttempt = await queryApi(lowerTitle, controller.signal);
      if (secondAttempt !== "not-found" && secondAttempt !== null) return secondAttempt;
    }

    return "Non disponible";
  } catch {
    return "Non disponible";
  } finally {
    clearTimeout(timeoutId);
  }
}
