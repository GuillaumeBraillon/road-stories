/**
 * Hook usePoiFilter
 *
 * Fournit la logique de filtrage métier pour sélectionner le prochain POI pertinent.
 * Exclut les POI déjà traités, administratifs ou sans contexte.
 * API : findNextPOI(pois, hasTriggered, markTriggered)
 */
import { useCallback } from "react";
import type { POI } from "../types";
import { logger } from "../services/logger";

const ENRICHING_TAGS = ["description", "inscription", "heritage", "castle_type", "site_type", "denomination", "religion", "ele", "height", "wikidata"];
const TOOL_SUPPORTED_CATEGORIES = new Set(["museum", "theatre", "artwork", "castle", "monument", "attraction", "arts_centre"]);

interface UsePoiFilterResult {
  findNextPOI: (pois: POI[], hasTriggered: (id: string) => boolean, markTriggered: (id: string) => void) => POI | undefined;
}

export function usePoiFilter(): UsePoiFilterResult {
  /**
   * Fonction principale : findNextPOI
   * - Parcourt la liste des POI
   * - Ignore ceux déjà traités (anti-doublon)
   * - Ignore les panneaux administratifs (guidepost, board de règles, etc)
   * - Ignore les POI sans contexte enrichissant (pas de tag pertinent, pas de catégorie supportée)
   * - Retourne le premier POI valide trouvé, ou undefined si aucun
   *
   * @param pois Liste de POI à filtrer
   * @param hasTriggered Fonction pour savoir si un POI a déjà été déclenché
   * @param markTriggered Fonction pour marquer un POI comme traité
   * @returns Le prochain POI pertinent ou undefined
   */
  const findNextPOI = useCallback((pois: POI[], hasTriggered: (id: string) => boolean, markTriggered: (id: string) => void): POI | undefined => {
    for (const poi of pois) {
      // 1. Anti-doublon : on saute les POI déjà traités
      if (hasTriggered(poi.id)) continue;

      // 2. Exclusion des panneaux administratifs et règles de parcs
      const isGuidepost = poi.tags["information"] === "guidepost";
      const isRuleBoard = poi.tags["information"] === "board" && poi.tags["board_type"] === "rules";
      const inscriptionText = (poi.tags["inscription"] || "").toLowerCase();
      const hasRuleKeywords =
        inscriptionText.includes("destinée aux enfants") || inscriptionText.includes("interdit aux") || inscriptionText.includes("règlement");

      if (isGuidepost || isRuleBoard || hasRuleKeywords) {
        logger.debug("poi-filter", "POI ignoré (panneau administratif) :", poi.name || "Sans nom");
        markTriggered(poi.id);
        continue;
      }

      // 3. Vérification du contexte enrichissant
      // Un POI est jugé "intéressant" s'il a au moins un tag enrichissant OU une catégorie supportée par les outils IA
      const hasEnrichingTag = ENRICHING_TAGS.some((key) => poi.tags[key]);
      const isEligibleForTools =
        TOOL_SUPPORTED_CATEGORIES.has(poi.tags["tourism"] || "") ||
        TOOL_SUPPORTED_CATEGORIES.has(poi.tags["amenity"] || "") ||
        TOOL_SUPPORTED_CATEGORIES.has(poi.tags["historic"] || "");

      if (!hasEnrichingTag && !isEligibleForTools) {
        logger.debug("poi-filter", "POI ignoré (contexte insuffisant) :", poi.name);
        markTriggered(poi.id);
        continue;
      }

      // 4. Premier POI valide trouvé
      return poi;
    }
    // Aucun POI pertinent trouvé
    return undefined;
  }, []);

  return { findNextPOI };
}
