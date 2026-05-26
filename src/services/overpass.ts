import type { Coords, POI, Theme } from "../types";
import { logger } from "./logger";

/**
 * Timeout maximum pour la coupure de la socket réseau client (en millisecondes).
 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Calcul dynamique du timeout Overpass Server (en secondes).
 * Formule : (Timeout Réseau / 1000) - Marge de sécurité réseau (1.5s).
 * Math.max(2, ...) garantit qu'on ne descendra jamais en dessous de 2 secondes si REQUEST_TIMEOUT_MS est configuré très bas.
 */
const OVERPASS_TIMEOUT_SEC = Math.max(2, Math.floor(REQUEST_TIMEOUT_MS / 1000 - 1.5));

/**
 * Noms explicites trop génériques pour être utiles (infrastructure routière OSM sans identité culturelle).
 * Permet d'exclure les POI sans identité culturelle.
 */
const GENERIC_NAMES = new Set(["tunnel", "route", "chemin", "rue", "avenue", "passage", "carrefour", "échangeur", "bretelle", "virage", "col"]);

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
function buildQuery(lat: number, lng: number, radiusMeters: number, filters: string[]): string {
  const nodes = filters.map((f) => `      node[${f}](around:${radiusMeters},${lat},${lng});`).join("\n");
  return `[out:json][timeout:${OVERPASS_TIMEOUT_SEC}];\n(\n${nodes}\n);\nout;`;
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
    logger.debug("overpass SERVICE", `→ ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.debug("overpass SERVICE", `✗ ${url} — HTTP ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }

    logger.debug("overpass SERVICE", `✓ ${url}`);
    return response.json() as Promise<OverpassResponse>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      logger.debug("overpass SERVICE", `✗ ${url} — timeout (${REQUEST_TIMEOUT_MS}ms)`);
      throw new Error("Timeout", { cause: error });
    }
    if (!(error instanceof Error && error.message.startsWith("HTTP"))) {
      logger.debug("overpass SERVICE", `✗ ${url} —`, error);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  // 1. Extraction directe et typée des filtres des sous-thèmes cochés (dont "tourism=information")
  const themeFilters = themes.filter((t) => t.enabled).flatMap((t) => t.osmFilters);

  // 2. Déduplication simple des filtres via un Set
  const allFilters = [...new Set(themeFilters)];

  // 3. Sécurité : si aucun thème n'est coché, on évite une requête Overpass invalide (vide)
  if (allFilters.length === 0) {
    logger.debug("overpass SERVICE", "⏭️ Aucun filtre actif sélectionné. Requête annulée.");
    return [];
  }

  const query = buildQuery(coords.lat, coords.lng, radiusMeters, allFilters);

  logger.debug("overpass SERVICE", "Requête envoyée au proxy Edge:\n" + query);

  // Appel unique et direct à ton proxy serveur
  const data = await fetchOverpass("/api/overpass", `data=${encodeURIComponent(query)}`);

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
}
