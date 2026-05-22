import type { PoiHistoryEntry, ThemeGroup, AppSettings } from "../types";
import { DEFAULT_SETTINGS } from "../types";

/**
 * Clé de stockage local pour l'historique des POI entendus.
 */
const HISTORY_KEY = "road-stories-history";

/**
 * Clé de stockage local pour les thèmes sélectionnés.
 */
const THEMES_KEY = "road-stories-themes";

// --- History ---

/**
 * Charge l'historique des POI entendus depuis le localStorage.
 *
 * - Gère la migration des anciens formats (ajoute poiId/toolsUsed si absent)
 * - Retourne un tableau vide en cas d'erreur ou d'absence de données
 *
 * @returns Liste normalisée d'entrées d'historique
 */
export function loadHistory(): PoiHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{
      poiId?: string;
      poiName: string;
      message: string;
      toolsUsed?: string[];
      source?: "gemini" | "wiki+gemini";
      timestamp: string;
    }>;
    return parsed.map((e) => ({
      poiId: e.poiId ?? "",
      poiName: e.poiName,
      message: e.message,
      toolsUsed: Array.isArray(e.toolsUsed) ? e.toolsUsed : e.source === "wiki+gemini" ? ["getWikipediaSummary"] : [],
      timestamp: new Date(e.timestamp),
    }));
  } catch {
    return [];
  }
}

/**
 * Sauvegarde l'historique des POI entendus dans le localStorage.
 * @param history Tableau d'entrées d'historique à persister
 */
export function saveHistory(history: PoiHistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// --- Themes ---
// On ne stocke que les états enabled (Record<themeId, boolean>) pour rester
// résilient aux ajouts de nouveaux thèmes dans DEFAULT_THEME_GROUPS.

/**
 * Charge les groupes de thèmes depuis le localStorage, en fusionnant avec les valeurs par défaut.
 *
 * - Seuls les états enabled sont persistés (résilience aux ajouts de thèmes)
 * - Si aucune donnée, retourne les defaults
 *
 * @param defaults Groupes de thèmes par défaut (structure complète)
 * @returns Groupes de thèmes avec états enabled restaurés
 */
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

/**
 * Sauvegarde les états enabled des sous-thèmes dans le localStorage.
 * Seule la structure { [themeId]: boolean } est persistée.
 * @param groups Groupes de thèmes à persister
 */
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

/**
 * Clé de stockage local pour les paramètres utilisateur (AppSettings).
 */
const SETTINGS_KEY = "road-stories-settings";

/**
 * Charge les paramètres utilisateur depuis le localStorage.
 * Fusionne avec les valeurs par défaut pour garantir la complétude.
 * @returns Paramètres applicatifs complets
 */
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

/**
 * Sauvegarde les paramètres utilisateur dans le localStorage.
 * @param settings Paramètres applicatifs à persister
 */
export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
