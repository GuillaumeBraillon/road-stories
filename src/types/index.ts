export type Coords = { lat: number; lng: number };

export type POI = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
};

export type Theme = {
  id: string;
  label: string;
  enabled: boolean;
  osmFilters: string[];
};

export type ThemeGroup = {
  id: string;
  label: string;
  icon: string;
  subThemes: Theme[];
};

export type AppStatus = "idle" | "listening" | "searching" | "no-poi" | "wikipedia" | "generating" | "speaking";

export type PoiHistoryEntry = {
  poiId: string;
  poiName: string;
  message: string;
  source: "gemini" | "wiki+gemini";
  timestamp: Date;
};

export type AppSettings = {
  pollIntervalMs: number;
  detectionRadiusM: number;
  overpassMoveThresholdM: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  pollIntervalMs: 30_000,
  detectionRadiusM: 500,
  overpassMoveThresholdM: 100,
};

export type GooglePriceLevel = "PRICE_LEVEL_FREE" | "PRICE_LEVEL_INEXPENSIVE" | "PRICE_LEVEL_MODERATE" | "PRICE_LEVEL_EXPENSIVE" | "PRICE_LEVEL_VERY_EXPENSIVE";

export interface PlaceResult {
  rating: number | null;
  userRatingCount: number | null;
  isOpenNow: boolean | null;
  todayHours: string | null;
  priceLevel: GooglePriceLevel | string | null;
  topReview: string | null;
  address: string | null;
  types: string[] | null;
  googleMapsUri: string | null;
  websiteUri: string | null;
}

export interface PlaceLookupParams {
  name: string;
  lat: number;
  lng: number;
}

export interface PlacesProxyRequestBody {
  name: string;
  lat: number;
  lng: number;
}

export interface PlacesProxyErrorBody {
  error: string;
}

export interface CacheEntry {
  result: PlaceResult;
  cachedAt: number;
}

export interface GooglePlacesTextSearchRequest {
  textQuery: string;
  locationRestriction: {
    rectangle: {
      low: { latitude: number; longitude: number };
      high: { latitude: number; longitude: number };
    };
  };
  maxResultCount: number;
  languageCode: string;
}

export interface GooglePlacesReviewText {
  text?: string;
}

export interface GooglePlacesReview {
  languageCode?: string;
  text?: GooglePlacesReviewText;
}

export interface GooglePlacesOpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
}

export interface GooglePlacesPlace {
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: GooglePlacesOpeningHours;
  priceLevel?: string;
  reviews?: GooglePlacesReview[];
  formattedAddress?: string;
  types?: string[];
  googleMapsUri?: string;
  websiteUri?: string;
}

export interface GooglePlacesTextSearchResponse {
  places?: GooglePlacesPlace[];
}

export interface PlacesToolArgs {
  name?: unknown;
  lat?: unknown;
  lng?: unknown;
}

export interface PlacesToolNormalizedArgs {
  name: string;
  lat: number;
  lng: number;
}

export interface PlacesToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: {
      name: { type: "STRING"; description: string };
      lat: { type: "NUMBER"; description: string };
      lng: { type: "NUMBER"; description: string };
    };
    required: ["name", "lat", "lng"];
  };
}

export type GetPlaceDetails = (name: string, lat: number, lng: number) => Promise<PlaceResult | null>;

export type FormatPriceLevel = (priceLevel: GooglePriceLevel | string | null) => string | null;
