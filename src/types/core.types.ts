export type Coords = { lat: number; lng: number };

export type POI = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
  themeLabel?: string; // 🎯 Pour lier le POI à son filtre d'origine
  themeIcon?: string;
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
  themeLabel?: string; // 🎯 Ajout de la string du thème (ex: "Châteaux & Citadelles")
  themeIcon?: string; // 🎯 Optionnel : pour afficher l'émoji du groupe (ex: "🏰")
};
