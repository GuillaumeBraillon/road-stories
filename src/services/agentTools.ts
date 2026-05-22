/**
 * Déclaration des outils utilisables par l'agent Gemini (tool use)
 *
 * Chaque outil est un objet avec :
 * - declaration : schéma OpenAPI-like pour Gemini
 * - execute : fonction appelée lors d'un tool call
 */
import { Type } from "@google/genai";
import type { FunctionCall } from "@google/genai";
import { getWikipediaSummary } from "./wikipedia";
import { getPlaceDetails, formatPriceLevel } from "./places";
import { logger } from "./logger";

/**
 * Décrit la déclaration d'un outil Gemini pour la tool use API
 * @property name Nom de l'outil
 * @property description Description affichée dans la console Gemini
 * @property parameters Schéma des paramètres attendus (OpenAPI-like)
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
 * Structure d'un outil Gemini utilisable dynamiquement
 * @property declaration Déclaration OpenAPI-like
 * @property execute Fonction asynchrone appelée lors d'un tool call
 */
type AgentTool = {
  declaration: ToolDeclaration;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

/**
 * Outil Wikipedia pour Gemini
 * Permet à Gemini de récupérer dynamiquement le résumé Wikipédia d'un lieu
 *
 * - name : getWikipediaSummary
 * - description : résumé Wikipédia en français
 * - parameters : { title: string }
 * - execute : appelle getWikipediaSummary puis log le résultat
 */
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

/**
 * Outil Google Places pour Gemini
 * Permet à Gemini de récupérer dynamiquement les informations pratiques d’un lieu visitable (musée, château, parc…)
 *
 * - name : getPlaceDetails
 * - description : note, horaires, adresse, tarifs, extrait d’avis Google
 * - parameters : { name: string, lat: number, lng: number }
 * - execute : appelle getPlaceDetails, formate la réponse, gère les cas d’absence de données
 *
 * Détails de fonctionnement :
 * - Ne doit PAS être appelé pour des éléments naturels sans infrastructure (ex: rivière, forêt)
 * - Utilise le nom OSM exact, la latitude et la longitude pour maximiser la précision de la recherche
 * - Si aucune donnée n’est trouvée, retourne un message explicite
 * - Formate la réponse pour un affichage oral naturel (adresse, note, horaires, tarifs, extrait d’avis)
 * - Utilise formatPriceLevel pour traduire le niveau de prix Google
 *
 * Bonnes pratiques :
 * - Toujours vérifier la présence de chaque champ avant affichage
 * - Ne jamais inventer d’information si le champ est absent
 * - Le texte retourné est destiné à être lu à voix haute
 */
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

/**
 * Tableau des outils disponibles pour l'agent Gemini
 * (utilisé pour le registre dynamique et l'export des déclarations)
 */
const AGENT_TOOLS: AgentTool[] = [wikipediaTool, placesTool];

/**
 * Export unique des déclarations pour le "config.tools" de Gemini
 * À utiliser dans la configuration Gemini pour déclarer les outils disponibles
 */
export const toolDeclarations = {
  functionDeclarations: AGENT_TOOLS.map((tool) => tool.declaration),
};

/**
 * Fonction unique d'exécution dynamique d'un tool call Gemini
 *
 * @param call Objet FunctionCall Gemini (nom + args)
 * @returns Résultat textuel à restituer à l'utilisateur
 *
 * - Vérifie la présence des arguments
 * - Recherche l'outil correspondant dans le registre
 * - Exécute la fonction associée et gère les erreurs
 */
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
