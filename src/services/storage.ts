import type { PoiHistoryEntry, ThemeGroup, AppSettings } from "../types";
import { DEFAULT_SETTINGS } from "../types";

const HISTORY_KEY = "road-stories-history";
const THEMES_KEY = "road-stories-themes";

// --- History ---

export function loadHistory(): PoiHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{
      poiId?: string;
      poiName: string;
      message: string;
      source: "gemini" | "wiki+gemini";
      timestamp: string;
    }>;
    return parsed.map((e) => ({
      poiId: e.poiId ?? "",
      poiName: e.poiName,
      message: e.message,
      source: e.source,
      timestamp: new Date(e.timestamp),
    }));
  } catch {
    return [];
  }
}

export function saveHistory(history: PoiHistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// --- Themes ---
// On ne stocke que les états enabled (Record<themeId, boolean>) pour rester
// résilient aux ajouts de nouveaux thèmes dans DEFAULT_THEME_GROUPS.

export function loadThemeGroups(defaults: ThemeGroup[]): ThemeGroup[] {
  try {
    const raw = localStorage.getItem(THEMES_KEY);
    if (!raw) return defaults;
    const enabled = JSON.parse(raw) as Record<string, boolean>;
    return defaults.map((group) => ({
      ...group,
      subThemes: group.subThemes.map((t) => ({
        ...t,
        enabled: t.id in enabled ? enabled[t.id] : t.enabled,
      })),
    }));
  } catch {
    return defaults;
  }
}

export function saveThemeGroups(groups: ThemeGroup[]): void {
  const enabled: Record<string, boolean> = {};
  groups
    .flatMap((g) => g.subThemes)
    .forEach((t) => {
      enabled[t.id] = t.enabled;
    });
  localStorage.setItem(THEMES_KEY, JSON.stringify(enabled));
}

// --- Settings ---

const SETTINGS_KEY = "road-stories-settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
