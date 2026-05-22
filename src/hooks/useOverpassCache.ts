import { useRef, useCallback } from "react";
import type { AppSettings, Coords, POI, Theme } from "../types";
import { getNearbyPOIs } from "../services/overpass";
import { calculateDistance } from "../services/geolocation";
import { logger } from "../services/logger";

interface CacheEntry {
  coords: Coords;
  themesKey: string;
  pois: POI[];
}

interface UseOverpassCacheResult {
  fetchPOIs: (coords: Coords, themes: Theme[], settings: AppSettings) => Promise<{ pois: POI[]; fromCache: boolean }>;
  invalidate: () => void;
}

function getThemesKey(themes: Theme[]): string {
  return themes
    .filter((t) => t.enabled)
    .map((t) => t.id)
    .join(",");
}

export function useOverpassCache(): UseOverpassCacheResult {
  const cacheRef = useRef<CacheEntry | null>(null);

  const fetchPOIs = useCallback(async (coords: Coords, themes: Theme[], settings: AppSettings): Promise<{ pois: POI[]; fromCache: boolean }> => {
    const themesKey = getThemesKey(themes);
    const cache = cacheRef.current;
    const hasMoved = !cache || calculateDistance(coords, cache.coords) > settings.overpassMoveThresholdM;
    const themesChanged = !cache || cache.themesKey !== themesKey;

    if (!hasMoved && !themesChanged && cache) {
      logger.debug(
        "overpass-cache",
        `${cache.pois.length} POI(s) en cache`,
        cache.pois.map((p) => p.name)
      );
      return { pois: cache.pois, fromCache: true };
    }

    logger.debug("overpass-cache", "Interrogation Overpass...");
    const pois = await getNearbyPOIs(coords, themes, settings.detectionRadiusM);
    cacheRef.current = { coords, themesKey, pois };
    logger.debug(
      "overpass-cache",
      `${pois.length} POI(s) trouvés`,
      pois.map((p) => p.name)
    );
    return { pois, fromCache: false };
  }, []);

  const invalidate = useCallback(() => {
    cacheRef.current = null;
  }, []);

  return { fetchPOIs, invalidate };
}
