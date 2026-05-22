/**
 * Orchestrateur et registre client des outils pour le Function Calling de Gemini.
 * Centralise l'injection dynamique des tags OpenStreetMap pour préserver le contexte des POI.
 * * @module services/agentTools
 */

import { Type } from "@google/genai";
import type { FunctionCall } from "@google/genai";
import * as wikipediaTool from "./wikipedia";
import { getPlaceDetails, formatPriceLevel } from "./places";
import { logger } from "./logger";

/**
 * Signature structurelle d'une déclaration d'outil conforme à l'API de Google Gen AI.
 */
type ToolDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: Type;
    properties: Record<string, { type: Type; description: string }>;
    required: string[];
  };
};

/**
 * Contrat d'interface unifié pour un outil exécutable par l'agent.
 */
type AgentTool = {
  declaration: ToolDeclaration;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

/**
 * Adaptateur de structure pour interfacer le module Google Places existant.
 */
const placesTool: AgentTool = {
  declaration: {
    name: "getPlaceDetails",
    description: "Récupère les détails pratiques (avis, note, prix, horaires) d'un commerce ou lieu d'activité.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Nom du commerce ou de l'établissement" },
        lat: { type: Type.NUMBER, description: "Latitude" },
        lng: { type: Type.NUMBER, description: "Longitude" },
      },
      required: ["name", "lat", "lng"],
    },
  },
  execute: async (args) => {
    // Extraction et typage explicite pour éviter le type 'unknown'
    const name = String(args["name"] ?? "");
    const lat = Number(args["lat"] ?? 0);
    const lng = Number(args["lng"] ?? 0);

    if (!name || !lat || !lng) {
      return "Arguments manquants pour l'appel de fonction getPlaceDetails";
    }

    // CORRECTION : Passage des 3 arguments attendus au lieu d'un objet unique
    const result = await getPlaceDetails(name, lat, lng);

    if (!result) return "Informations Google Places non disponibles pour ce lieu";

    return `Note: ${result.rating ?? "N/A"}/5 (${result.userRatingCount ?? 0} avis)
Prix: ${formatPriceLevel(result.priceLevel)}
Horaires aujourd'hui: ${result.todayHours ?? "non renseignés"}
Statut: ${result.isOpenNow ? "Ouvert actuellement" : "Fermé actuellement"}
Extrait d'un avis: ${result.topReview ?? "aucun avis disponible"}`;
  },
};

/**
 * Registre des outils locaux de l'application.
 */
const AGENT_TOOLS: AgentTool[] = [wikipediaTool as AgentTool, placesTool];

/**
 * Export unique configuré pour être passé directement dans le tableau `tools` du SDK Gemini.
 */
export const toolDeclarations = {
  functionDeclarations: AGENT_TOOLS.map((t) => t.declaration),
};

/**
 * Routeur dynamique d'exécution des appels d'outils (`FunctionCall`) émis par Gemini.
 * Intercepte les requêtes Wikipédia pour y injecter le dictionnaire de métadonnées OSM du POI courant.
 * * @param {FunctionCall} call - Objet d'appel généré par l'IA (contenant le nom et les arguments bruts).
 * @param {Record<string, string>} [currentPoiTags] - Optionnel : Les tags géographiques OpenStreetMap du POI analysé.
 * @returns {Promise<string>} La réponse textuelle formatée issue de l'outil.
 */
export async function executeToolCall(call: FunctionCall, currentPoiTags?: Record<string, string>): Promise<string> {
  if (!call.args) {
    return "Arguments manquants pour l'appel de fonction";
  }

  const tool = AGENT_TOOLS.find((t) => t.declaration.name === call.name);
  if (!tool) {
    return "Outil inconnu";
  }

  try {
    const executionArgs = { ...(call.args as Record<string, unknown>) };

    // Injection du dictionnaire de tags pour l'outil Wikipedia
    if (call.name === "getWikipediaSummary" && currentPoiTags) {
      executionArgs["tags"] = currentPoiTags;
    }

    return await tool.execute(executionArgs);
  } catch (error) {
    logger.error("gemini", `Erreur d'exécution de l'outil ${call.name} :`, error);
    return "Non disponible";
  }
}
