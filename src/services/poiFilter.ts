/**
 * Logique de filtrage des POIs OSM.
 * Responsabilité unique : décider si un POI mérite d'être traité.
 * Aucune dépendance vers Gemini, Wikipedia ou Places.
 */
import { logger } from "./logger";

// --- Panneaux administratifs à ignorer ---

const BLACKLISTED_INFORMATION_TYPES = new Set(["rules", "map", "guidepost", "office"]);

// --- Tags enrichissants ---

/**
 * Tags OSM qui apportent du contenu réel au-delà de la simple classification.
 * Un POI avec au moins un de ces tags a du contexte exploitable.
 */
const ENRICHING_TAGS = ["description", "inscription", "heritage", "castle_type", "site_type", "denomination", "religion", "ele", "height", "wikidata"];

// --- Éligibilité aux outils Gemini ---

/**
 * Catégories pour lesquelles Gemini peut appeler Wikipedia ou Google Places.
 * Ces POIs sont retenus même sans tags enrichissants OSM.
 */
const TOOL_SUPPORTED_CATEGORIES = new Set([
  "museum",
  "castle",
  "monument",
  "theme_park",
  "viewpoint",
  "monastery",
  "abbey",
  "fortress",
  "aqueduct",
  "viaduct",
  "zoo",
  "water_park",
  "racetrack",
  "aquarium",
  // Ajouts thématique Ferroviaire :
  "train_station",
  "station",
  "museum", // Déjà inclus, mais gère railway=museum nativement si mappé
]);

/**
 * Retourne true si le POI est un panneau administratif sans valeur culturelle
 * (règlement de parc, plan de bus, bureau d'information, etc.)
 */
export function isAdministrativePOI(tags: Record<string, string>): boolean {
  if (tags["information"] === "board" && BLACKLISTED_INFORMATION_TYPES.has(tags["board_type"] || "")) {
    return true;
  }

  if (tags["information"] === "guidepost") return true;

  const inscription = (tags["inscription"] || "").toLowerCase();
  return (
    inscription.includes("interdit aux") ||
    inscription.includes("destinée aux enfants") ||
    inscription.includes("sous la surveillance") ||
    inscription.includes("règlement")
  );
}

/**
 * Retourne true si le POI possède au moins un tag enrichissant.
 */
export function hasEnoughContext(tags: Record<string, string>): boolean {
  return ENRICHING_TAGS.some((key) => tags[key]);
}

/**
 * Retourne true si le POI appartient à une catégorie
 * pour laquelle Gemini peut utiliser ses outils.
 */
export function isEligibleForTools(tags: Record<string, string>): boolean {
  return (
    TOOL_SUPPORTED_CATEGORIES.has(tags["tourism"] || "") ||
    TOOL_SUPPORTED_CATEGORIES.has(tags["amenity"] || "") ||
    TOOL_SUPPORTED_CATEGORIES.has(tags["historic"] || "")
  );
}

/**
 * Point d'entrée principal — retourne true si le POI doit être ignoré.
 * Combine les trois critères dans l'ordre du moins coûteux au plus coûteux.
 * * @param tags Attributs OSM du point d'intérêt.
 * @param poiName Nom optionnel du POI pour enrichir la traçabilité des logs.
 */
export function shouldSkipPOI(tags: Record<string, string>, poiName: string = "POI Inconnu"): boolean {
  // 1. Filtrage des éléments administratifs ou restrictifs
  if (isAdministrativePOI(tags)) {
    logger.debug("poiFilter", `❌ Rejeté [isAdministrativePOI] -> "${poiName}"`);
    return true;
  }

  // 2. Vérification de la richesse des données OSM locales
  const hasContext = hasEnoughContext(tags);

  // 3. Vérification de la compatibilité avec les API distantes (Wikipedia/Places)
  const isEligibleTools = isEligibleForTools(tags);

  // Si le POI n'a pas de contexte OSM ET n'est pas éligible aux outils externes, on le skip
  if (!hasContext && !isEligibleTools) {
    logger.debug(
      "poiFilter",
      `❌ Rejeté [Manque de contexte & Inéligible outils] -> "${poiName}" (tourism: "${tags.tourism ?? "aucun"}", amenity: "${tags.amenity ?? "aucun"}", historic: "${tags.historic ?? "aucun"}")`
    );
    return true;
  }

  logger.debug("poiFilter", `✅ Validé pour traitement -> "${poiName}" (HasContext: ${hasContext}, IsEligibleTools: ${isEligibleTools})`);
  return false;
}
