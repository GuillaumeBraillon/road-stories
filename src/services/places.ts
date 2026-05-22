import type { FormatPriceLevel, GetPlaceDetails, GooglePriceLevel, PlaceResult } from "../types/places.types";
import { logger } from "./logger";

/**
 * Délai maximal pour les requêtes Google Places (en ms)
 * Permet d'éviter les requêtes bloquantes côté client
 */
const TIMEOUT_MS = 8_000;

/**
 * Formate le niveau de prix Google Places en label utilisateur
 * @param priceLevel Niveau de prix Google Places
 * @returns Label utilisateur ou null
 */
export const formatPriceLevel: FormatPriceLevel = (priceLevel) => {
  // Table de correspondance entre les niveaux Google et les labels affichés
  const labels: Record<GooglePriceLevel, string> = {
    PRICE_LEVEL_FREE: "Entrée gratuite",
    PRICE_LEVEL_INEXPENSIVE: "Peu coûteux",
    PRICE_LEVEL_MODERATE: "Prix modérés",
    PRICE_LEVEL_EXPENSIVE: "Entrée payante",
    PRICE_LEVEL_VERY_EXPENSIVE: "Entrée très coûteuse",
  };

  if (!priceLevel) return null;

  const normalized = priceLevel as GooglePriceLevel;
  return labels[normalized] ?? null;
};

/**
 * Récupère les détails pratiques d'un lieu via l'API Google Places (endpoint proxy /api/places)
 * - name : nom du lieu
 * - lat/lng : coordonnées GPS
 * - Timeout 8s
 * - Retourne null si non trouvé ou erreur
 *
 * @param name Nom du lieu
 * @param lat Latitude
 * @param lng Longitude
 * @returns PlaceResult ou null
 */
export const getPlaceDetails: GetPlaceDetails = async (name, lat, lng): Promise<PlaceResult | null> => {
  // Contrôleur d'annulation pour gérer le timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Construction de l'URL d'appel (proxy côté serveur)
    const url = `/api/places?name=${encodeURIComponent(name)}&lat=${lat}&lng=${lng}`;

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      logger.error("[places] HTTP error", response.status);
      return null;
    }

    const result = (await response.json()) as PlaceResult;
    logger.debug("places", result);
    return result;
  } catch (error) {
    // Gestion des erreurs réseau classiques (timeout, fetch annulé, etc.)
    if (error instanceof DOMException && error.name === "AbortError") return null;
    if (error instanceof TypeError) return null;
    logger.error("[places] Unexpected error", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export type { FormatPriceLevel, GetPlaceDetails, GooglePriceLevel, PlaceResult };
