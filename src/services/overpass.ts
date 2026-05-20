import type { Coords, POI, Theme } from "../types";
import { logger } from "./logger";

const OVERPASS_ENDPOINTS = [
  "/api/overpass", // Vercel Edge proxy (évite les erreurs CORS en production)
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

/** Noms explicites trop génériques pour être utiles (infrastructure routière OSM sans identité culturelle) */
const GENERIC_NAMES = new Set(["tunnel", "route", "chemin", "rue", "avenue", "passage", "carrefour", "échangeur", "bretelle", "virage", "col"]);

/**
 * Résout le nom d'affichage d'un nœud OSM :
 * 1. `name:fr` / `name` explicite — sauf si infrastructure routière générique
 * 2. `inscription` (texte gravé sur le monument)
 * Les valeurs dérivées de tags de type (`historic`, `tourism`, `natural`)
 * sont intentionnellement exclues : sans nom propre, elles ne permettent pas
 * de générer un message culturellement utile.
 * Retourne `null` si aucun nom significatif n'est identifiable.
 */
function resolvePoiName(tags: Record<string, string>): string | null {
  const explicit = tags["name:fr"] ?? tags["name"];
  if (explicit) return GENERIC_NAMES.has(explicit.trim().toLowerCase()) ? null : explicit;

  if (tags["inscription"]) return tags["inscription"];

  if (tags["operator"]) return tags["operator"];

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
