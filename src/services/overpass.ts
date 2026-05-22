import type { Coords, POI, Theme } from "../types";
import { logger } from "./logger";

/**
 * Liste ordonnée des endpoints Overpass utilisés pour récupérer les POI.
 * Le proxy edge ("/api/overpass") est prioritaire en production pour éviter les erreurs CORS.
 * Les autres sont des miroirs publics, le dernier (overpass-api.de) est réservé au dev local (CORS bloqué en prod).
 */
const OVERPASS_ENDPOINTS = [
  "/api/overpass", // Vercel Edge proxy (production — évite les erreurs CORS)
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter", // dev local uniquement (CORS bloqué en production)
];

/**
 * Timeout maximum pour chaque requête Overpass (en millisecondes).
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Structure d'un nœud OSM tel que retourné par Overpass.
 */
interface OverpassNode {
  /** Identifiant unique du nœud OSM */
  id: number;
  /** Latitude du nœud */
  lat: number;
  /** Longitude du nœud */
  lon: number;
  /** Tags OSM associés au nœud */
  tags?: Record<string, string>;
}

/**
 * Structure de la réponse Overpass (format JSON).
 */
interface OverpassResponse {
  /** Liste des nœuds OSM retournés */
  elements: OverpassNode[];
}

/**
 * Génère une requête OverpassQL adaptée à la position, au rayon et aux filtres OSM.
 * @param lat Latitude du centre de recherche
 * @param lng Longitude du centre de recherche
 * @param radiusMeters Rayon de recherche en mètres
 * @param osmFilters Tableau de filtres OSM (ex: '"tourism"="information"')
 * @returns Chaîne de requête OverpassQL prête à être envoyée
 */
function buildQuery(lat: number, lng: number, radiusMeters: number, osmFilters: string[]): string {
  const around = `(around:${radiusMeters},${lat},${lng})`;
  const nodes = osmFilters.map((f) => `      node[${f}]${around};`).join("\n");
  return `[out:json][timeout:8];\n(\n${nodes}\n);\nout;`;
}

/**
 * Convertit un nœud Overpass en POI standardisé pour l'application.
 * @param node Nœud Overpass à convertir
 * @returns POI formaté pour l'app
 */
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

/**
 * Effectue une requête POST Overpass avec gestion du timeout et des erreurs HTTP.
 * @param url Endpoint Overpass
 * @param body Corps de la requête (form-urlencoded)
 * @returns Réponse JSON parsée
 * @throws Error en cas d'échec réseau ou HTTP
 */
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

/**
 * Noms explicites trop génériques pour être utiles (infrastructure routière OSM sans identité culturelle).
 * Permet d'exclure les POI sans identité culturelle.
 */
const GENERIC_NAMES = new Set(["tunnel", "route", "chemin", "rue", "avenue", "passage", "carrefour", "échangeur", "bretelle", "virage", "col"]);

/**
 * Résout le nom d'affichage d'un nœud OSM.
 *
 * 1. Utilise `name:fr` ou `name` si présent et non générique
 * 2. Sinon, utilise `inscription` (texte gravé sur le monument)
 * 3. Sinon, utilise `operator` (nom de l'opérateur)
 *
 * Les valeurs dérivées de tags de type (`historic`, `tourism`, `natural`)
 * sont intentionnellement exclues : sans nom propre, elles ne permettent pas
 * de générer un message culturellement utile.
 *
 * @param tags Tags OSM du nœud
 * @returns Nom significatif ou null
 */
function resolvePoiName(tags: Record<string, string>): string | null {
  const explicit = tags["name:fr"] ?? tags["name"];
  if (explicit) return GENERIC_NAMES.has(explicit.trim().toLowerCase()) ? null : explicit;

  if (tags["inscription"]) return tags["inscription"];

  if (tags["operator"]) return tags["operator"];

  return null;
}

/**
 * Filtres OSM toujours actifs, indépendamment des thèmes sélectionnés.
 * Permet de toujours récupérer les points d'information touristique.
 */
const ALWAYS_ACTIVE_FILTERS = ['"tourism"="information"'];

/**
 * Récupère les POI à proximité d'une position, selon les thèmes actifs et le rayon.
 *
 * - Construit dynamiquement la requête Overpass en combinant les filtres OSM des thèmes actifs
 * - Tente chaque endpoint Overpass dans l'ordre jusqu'à succès
 * - Filtre les POI sans nom significatif ou doublons
 *
 * @param coords Coordonnées GPS de référence
 * @param themes Liste des thèmes sélectionnés (avec osmFilters)
 * @param radiusMeters Rayon de recherche en mètres (défaut 500)
 * @returns Liste de POI formatés
 * @throws Error si tous les endpoints échouent
 */
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
