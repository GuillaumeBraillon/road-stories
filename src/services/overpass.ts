import type { Coords, POI, Theme } from "../types";
import { logger } from "./logger";

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const REQUEST_TIMEOUT_MS = 10_000;

interface OverpassNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassNode[];
}

function buildQuery(lat: number, lng: number, radiusMeters: number, osmFilters: string[]): string {
  const around = `(around:${radiusMeters},${lat},${lng})`;
  const nodes = osmFilters.map((f) => `      node[${f}]${around};`).join("\n");
  return `[out:json][timeout:8];\n(\n${nodes}\n);\nout;`;
}

function nodeToPoI(node: OverpassNode): POI {
  const tags = node.tags ?? {};
  return {
    id: String(node.id),
    name: resolvePoiName(tags) ?? `OSM ${node.id}`,
    lat: node.lat,
    lng: node.lon,
    tags,
  };
}

async function fetchOverpass(url: string, body: string): Promise<OverpassResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json() as Promise<OverpassResponse>;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Noms trop génériques pour identifier un site culturel (infrastructure routière ou type OSM non spécifique) */
const GENERIC_NAMES = new Set([
  "tunnel",
  "route",
  "chemin",
  "rue",
  "avenue",
  "passage",
  "carrefour",
  "échangeur",
  "bretelle",
  "virage",
  "col",
  "ruins",
  "building",
]);

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

/**
 * Résout le nom d'affichage d'un nœud OSM par ordre de priorité :
 * 1. `name:fr` / `name` explicite — sauf si générique (infrastructure routière)
 * 2. `inscription` (texte gravé sur le monument)
 * 3. Valeur de `historic` — sauf si générique (ex : «ruins», «building»)
 * 4. Valeur de `tourism` — sauf «yes» et «iformation» (trop vague)
 * 5. Valeur de `natural`
 * Retourne `null` si aucun nom significatif n'est dérivable.
 */
function resolvePoiName(tags: Record<string, string>): string | null {
  const explicit = tags["name:fr"] ?? tags["name"];
  if (explicit) return GENERIC_NAMES.has(explicit.trim().toLowerCase()) ? null : explicit;

  if (tags["inscription"]) return tags["inscription"];

  const historic = tags["historic"];
  if (historic && historic !== "yes" && !GENERIC_NAMES.has(historic)) return capitalize(historic);

  const tourism = tags["tourism"];
  if (tourism && tourism !== "yes" && tourism !== "information") return capitalize(tourism);

  const natural = tags["natural"];
  if (natural) return capitalize(natural);

  return null;
}

/** Filtres OSM toujours actifs, indépendamment des thèmes sélectionnés */
const ALWAYS_ACTIVE_FILTERS = ['"tourism"="information"'];

export async function getNearbyPOIs(coords: Coords, themes: Theme[], radiusMeters: number = 500): Promise<POI[]> {
  const themeFilters = themes.filter((t) => t.enabled).flatMap((t) => t.osmFilters);
  const allFilters = [...new Set([...ALWAYS_ACTIVE_FILTERS, ...themeFilters])];
  const query = buildQuery(coords.lat, coords.lng, radiusMeters, allFilters);
  logger.debug("overpass", "Query :\n" + query);

  let lastError: unknown;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchOverpass(endpoint, `data=${encodeURIComponent(query)}`);
      const seenNames = new Set<string>();
      return data.elements
        .filter((el) => {
          if (!el.lat) return false;

          const name = resolvePoiName(el.tags ?? {});
          if (!name) return false;

          if (seenNames.has(name)) return false;
          seenNames.add(name);

          return true;
        })
        .map(nodeToPoI);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Tous les endpoints Overpass ont échoué : ${String(lastError)}`);
}
