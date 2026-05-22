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

export type AppStatus = "idle" | "listening" | "searching" | "no-poi" | "generating" | "speaking";

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

export type PoiHistoryEntry = {
  poiId: string;
  poiName: string;
  message: string;
  toolsUsed: string[];
  timestamp: Date;
};
