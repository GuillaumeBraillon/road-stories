import { buildUserPrompt } from "./prompts";
import type { GenerateMessageParams } from "../types/gemini.types";

/**
 * Arguments pour l'appel à l'outil Google Places
 * name : nom du lieu
 * lat/lng : coordonnées GPS
 */
export type PlaceDetailsArgs = {
  name: string;
  lat: number;
  lng: number;
};

/**
 * Nom de l'outil Google Places (pour Gemini)
 */
export const GOOGLE_PLACES_TOOL_NAME = "getPlaceDetails";

/**
 * Détermine si le résultat d'un outil Gemini est exploitable
 * @param result Résultat brut
 * @returns true si le résultat est utile
 */
export function isUsefulToolResult(result: string | undefined): result is string {
  if (!result) return false;
  return (
    result !== "Non disponible" &&
    result !== "Informations Google Places non disponibles pour ce lieu" &&
    !result.startsWith("Erreur") &&
    !result.startsWith("Arguments manquants")
  );
}

/**
 * Ajoute le nom de l'outil à la liste si le résultat est utile
 * @param toolsUsed Liste des outils utilisés
 * @param toolName Nom de l'outil
 * @param result Résultat brut
 */
export function markToolUsedIfUseful(toolsUsed: string[], toolName: string | undefined, result: string | undefined): void {
  if (toolName && isUsefulToolResult(result) && !toolsUsed.includes(toolName)) {
    toolsUsed.push(toolName);
  }
}

/**
 * Indique si le POI justifie une préfetch Google Places
 * @param poiTags Tags OSM du POI
 * @returns true si un tag pertinent est présent
 */
export function shouldPrefetchGooglePlaces(poiTags: Record<string, string>): boolean {
  return !!(poiTags["amenity"] || poiTags["shop"] || poiTags["tourism"] || poiTags["craft"]);
}

/**
 * Préfetch asynchrone des données Google Places pour un POI
 * - Exécute la fonction d'appel
 * - Ajoute l'outil à la liste si résultat utile
 * - Gère les erreurs
 *
 * @param params Paramètres Gemini
 * @param executePlaceDetails Fonction d'appel
 * @param onError Callback erreur
 * @returns Données Google Places et outils utilisés
 */
export async function prefetchGooglePlaces(
  params: GenerateMessageParams,
  executePlaceDetails: (args: PlaceDetailsArgs) => Promise<string>,
  onError?: (error: unknown) => void
): Promise<{ googlePlacesData: string; toolsUsed: string[] }> {
  const toolsUsed: string[] = [];

  if (!shouldPrefetchGooglePlaces(params.poiTags)) {
    return { googlePlacesData: "Non cherché", toolsUsed };
  }

  try {
    const result = await executePlaceDetails({
      name: params.poiName,
      lat: params.coords.lat,
      lng: params.coords.lng,
    });

    markToolUsedIfUseful(toolsUsed, GOOGLE_PLACES_TOOL_NAME, result);
    return { googlePlacesData: result || "Non disponible", toolsUsed };
  } catch (error) {
    onError?.(error);
    return { googlePlacesData: "Non disponible", toolsUsed };
  }
}

/**
 * Construit le prompt utilisateur enrichi avec les données Google Places
 * Ajoute des consignes spécifiques pour les œuvres d'art
 * @param params Paramètres Gemini
 * @param googlePlacesData Données Google Places
 * @returns Prompt utilisateur enrichi
 */
export function buildEnrichedUserPrompt(params: GenerateMessageParams, googlePlacesData: string): string {
  let userPrompt = buildUserPrompt(params.poiName, params.coords, params.poiTags);
  userPrompt += `\n\nDonnées Google Places réelles trouvées : ${googlePlacesData}`;
  userPrompt += "\nNote: Si un avis marquant ou une excellente note est présent, intègre-le de manière naturelle dans ton récit.";

  // Ajout de consignes spécifiques pour les œuvres d'art
  if (params.poiTags["tourism"] === "artwork" || params.poiTags["artwork_type"]) {
    userPrompt += `\n\nCONSIGNES IMPÉRATIVES POUR CETTE ŒUVRE D'ART :
- Si le tag 'artist_name' est présent (${params.poiTags["artist_name"] || "non"}), tu DOIS obligatoirement citer le nom de l'artiste dans ton récit.
- Si le tag 'material' est présent (${params.poiTags["material"] || "non"}), tu DOIS obligatoirement mentionner le matériau utilisé (ex: métal, bronze, pierre).`;
  }

  return userPrompt;
}
