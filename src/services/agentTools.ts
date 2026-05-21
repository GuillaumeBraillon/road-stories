import { Type } from "@google/genai";
import type { FunctionCall } from "@google/genai";
import { getWikipediaSummary } from "./wikipedia";
import { getPlaceDetails, formatPriceLevel } from "./places";
import { logger } from "./logger";

type ToolDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: Type;
    properties: Record<string, { type: Type; description: string }>;
    required: string[];
  };
};

type AgentTool = {
  declaration: ToolDeclaration;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

// --- OUTIL 1 : WIKIPÉDIA ---
const wikipediaTool: AgentTool = {
  declaration: {
    name: "getWikipediaSummary",
    description: "Récupère le résumé Wikipédia en français d'un lieu historique ou remarquable.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Nom du lieu à rechercher" },
      },
      required: ["title"],
    },
  },
  execute: async (args) => {
    const title = String(args["title"] ?? "");
    const summary = await getWikipediaSummary(title);
    logger.debug("gemini", `Wikipedia (tool call) "${title}" :`, summary ?? "Non disponible");
    return summary ?? "Non disponible";
  },
};

// --- OUTIL 2 : GOOGLE PLACES ---
const placesTool: AgentTool = {
  declaration: {
    name: "getPlaceDetails",
    description:
      "Récupère depuis Google Places la note, les horaires, l'adresse et les tarifs. À appeler uniquement pour les lieux visitables par le public (musées, châteaux, parcs aménagés). Ne PAS appeler pour des éléments naturels sans infrastructure.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Nom exact du lieu tel qu'il apparaît sur OSM" },
        lat: { type: Type.NUMBER, description: "Latitude du lieu" },
        lng: { type: Type.NUMBER, description: "Longitude du lieu" },
      },
      required: ["name", "lat", "lng"],
    },
  },
  execute: async (args) => {
    const name = String(args["name"] ?? "");
    const lat = Number(args["lat"]);
    const lng = Number(args["lng"]);

    const result = await getPlaceDetails(name, lat, lng);
    if (!result) return "Informations Google Places non disponibles pour ce lieu";

    return `Nom: ${name}
Adresse: ${result.address ?? "non disponible"}
Note: ${result.rating}/5 (${result.userRatingCount} avis)
Ouvert maintenant: ${result.isOpenNow ? "oui" : "non"}
Horaires aujourd'hui: ${result.todayHours ?? "non disponibles"}
Tarifs: ${formatPriceLevel(result.priceLevel) ?? "non renseignés"}
Extrait d'un avis: ${result.topReview ?? "aucun avis disponible"}`;
  },
};

// --- REGISTRE DES OUTILS ---
const AGENT_TOOLS: AgentTool[] = [wikipediaTool, placesTool];

// Export unique des déclarations pour le "config.tools" de Gemini
export const toolDeclarations = {
  functionDeclarations: AGENT_TOOLS.map((tool) => tool.declaration),
};

// Fonction unique d'exécution dynamique
export async function executeToolCall(call: FunctionCall): Promise<string> {
  if (!call.args) {
    return "Arguments manquants pour l'appel de fonction";
  }

  const tool = AGENT_TOOLS.find((candidate) => candidate.declaration.name === call.name);
  if (!tool) {
    return "Outil inconnu";
  }

  try {
    // Cast sécurisé des arguments pour correspondre à la signature attendue
    return await tool.execute(call.args as Record<string, unknown>);
  } catch (error) {
    logger.error("gemini", `Erreur lors de l'exécution de l'outil ${call.name}:`, error);
    return "Erreur interne lors de l'exécution de l'outil";
  }
}
