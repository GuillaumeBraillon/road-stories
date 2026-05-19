import type { Coords, POI, Theme } from "../types";
import { logger } from "./logger";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
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
  const name = tags["name:fr"] ?? tags["name"] ?? `OSM ${node.id}`;
  return {
    id: String(node.id),
    name,
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

// Noms OSM génériques qui correspondent à de l'infrastructure routière sans intérêt culturel
const GENERIC_NAMES = new Set(["tunnel", "route", "chemin", "rue", "avenue", "passage", "carrefour", "échangeur", "bretelle", "virage", "col"]);

function isMeaningfulName(name: string): boolean {
  return !GENERIC_NAMES.has(name.trim().toLowerCase());
}

export async function getNearbyPOIs(coords: Coords, themes: Theme[], radiusMeters: number = 500): Promise<POI[]> {
  const activeFilters = themes.filter((t) => t.enabled).flatMap((t) => t.osmFilters);
  if (activeFilters.length === 0) return [];

  const query = buildQuery(coords.lat, coords.lng, radiusMeters, activeFilters);
  logger.debug("overpass", "Query :\n" + query);
  const body = `data=${encodeURIComponent(query)}`;

  let lastError: unknown;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchOverpass(endpoint, body);
      const seenNames = new Set<string>();
      return data.elements
        .filter((el) => {
          if (!el.lat) return false;

          const name = el.tags?.["name:fr"] ?? el.tags?.["name"];
          if (!name) return false;

          if (!isMeaningfulName(name)) return false;

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
