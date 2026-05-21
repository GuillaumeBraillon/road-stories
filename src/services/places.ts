import type { FormatPriceLevel, GetPlaceDetails, GooglePriceLevel, PlaceResult } from "../types";
import { logger } from "./logger";

const TIMEOUT_MS = 8_000;

export const formatPriceLevel: FormatPriceLevel = (priceLevel) => {
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

export const getPlaceDetails: GetPlaceDetails = async (name, lat, lng): Promise<PlaceResult | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
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
    if (error instanceof DOMException && error.name === "AbortError") return null;
    if (error instanceof TypeError) return null;
    logger.error("[places] Unexpected error", error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export type { FormatPriceLevel, GetPlaceDetails, GooglePriceLevel, PlaceResult };
