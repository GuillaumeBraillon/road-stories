import { buildUserPrompt } from "./prompts";
import type { GenerateMessageParams } from "../types/gemini.types";

export type PlaceDetailsArgs = {
  name: string;
  lat: number;
  lng: number;
};

export const GOOGLE_PLACES_TOOL_NAME = "getPlaceDetails";

export function isUsefulToolResult(result: string | undefined): result is string {
  if (!result) return false;
  return (
    result !== "Non disponible" &&
    result !== "Informations Google Places non disponibles pour ce lieu" &&
    !result.startsWith("Erreur") &&
    !result.startsWith("Arguments manquants")
  );
}

export function markToolUsedIfUseful(toolsUsed: string[], toolName: string | undefined, result: string | undefined): void {
  if (toolName && isUsefulToolResult(result) && !toolsUsed.includes(toolName)) {
    toolsUsed.push(toolName);
  }
}

export function shouldPrefetchGooglePlaces(poiTags: Record<string, string>): boolean {
  return !!(poiTags["amenity"] || poiTags["shop"] || poiTags["tourism"] || poiTags["craft"]);
}

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

export function buildEnrichedUserPrompt(params: GenerateMessageParams, googlePlacesData: string): string {
  let userPrompt = buildUserPrompt(params.poiName, params.coords, params.poiTags);
  userPrompt += `\n\nDonnées Google Places réelles trouvées : ${googlePlacesData}`;
  userPrompt += "\nNote: Si un avis marquant ou une excellente note est présent, intègre-le de manière naturelle dans ton récit.";

  if (params.poiTags["tourism"] === "artwork" || params.poiTags["artwork_type"]) {
    userPrompt += `\n\nCONSIGNES IMPÉRATIVES POUR CETTE ŒUVRE D'ART :
- Si le tag 'artist_name' est présent (${params.poiTags["artist_name"] || "non"}), tu DOIS obligatoirement citer le nom de l'artiste dans ton récit.
- Si le tag 'material' est présent (${params.poiTags["material"] || "non"}), tu DOIS obligatoirement mentionner le matériau utilisé (ex: métal, bronze, pierre).`;
  }

  return userPrompt;
}
