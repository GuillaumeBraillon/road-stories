/**
 * Hook useOverpassCache
 *
 * Gère un cache local pour les résultats Overpass (OpenStreetMap).
 * Évite les requêtes réseau redondantes selon la position et les thèmes actifs.
 * Fournit fetchPOIs (fetch + cache) et invalidate (reset).
 */
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
  /**
   * Référence persistante du cache local.
   * Structure : { coords, themesKey, pois[] }
   * - coords : dernière position utilisée pour la requête
   * - themesKey : concaténation des ids de thèmes actifs
   * - pois : liste des POI retournés par Overpass
   */
  const cacheRef = useRef<CacheEntry | null>(null);

  /**
   * Fonction principale : fetchPOIs
   * - Si la position ET les thèmes n'ont pas changé, retourne le cache
   * - Sinon, interroge Overpass, met à jour le cache et retourne les nouveaux POI
   * - Loggue chaque étape pour le debug
   *
   * @param coords Position GPS courante
   * @param themes Thèmes actifs
   * @param settings Réglages utilisateur (inclut le seuil de mouvement)
   * @returns { pois, fromCache } : liste de POI et indicateur de cache
   */
  const fetchPOIs = useCallback(async (coords: Coords, themes: Theme[], settings: AppSettings): Promise<{ pois: POI[]; fromCache: boolean }> => {
    const themesKey = getThemesKey(themes);
    const cache = cacheRef.current;
    // On considère qu'il faut refetch si :
    // - pas de cache
    // - l'utilisateur a bougé de plus que le seuil
    // - les thèmes actifs ont changé
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

    // Si on arrive ici, il faut interroger Overpass
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

  /**
   * Invalide le cache (utilisé lors d’un changement de réglages ou de thèmes)
   */
  const invalidate = useCallback(() => {
    cacheRef.current = null;
  }, []);

  return { fetchPOIs, invalidate };
}
