import { useCallback } from "react";
import type { POI } from "../types";
import { logger } from "../services/logger";

const ENRICHING_TAGS = ["description", "inscription", "heritage", "castle_type", "site_type", "denomination", "religion", "ele", "height", "wikidata"];
const TOOL_SUPPORTED_CATEGORIES = new Set(["museum", "theatre", "artwork", "castle", "monument", "attraction", "arts_centre"]);

interface UsePoiFilterResult {
  findNextPOI: (pois: POI[], hasTriggered: (id: string) => boolean, markTriggered: (id: string) => void) => POI | undefined;
}

export function usePoiFilter(): UsePoiFilterResult {
  const findNextPOI = useCallback((pois: POI[], hasTriggered: (id: string) => boolean, markTriggered: (id: string) => void): POI | undefined => {
    for (const poi of pois) {
      if (hasTriggered(poi.id)) continue;

      // Exclusion des panneaux administratifs et règles de parcs
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

      // Vérification du contexte enrichissant
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

      return poi;
    }
    return undefined;
  }, []);

  return { findNextPOI };
}
