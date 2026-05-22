/**
 * Proxy Vercel Edge Function — Overpass API
/**
 * Proxy Vercel Edge Function — Overpass API
 *
 * Résout les erreurs CORS : le fetch vers Overpass s'effectue côté serveur.
 * Utilise Promise.any() pour lancer toutes les requêtes en parallèle et
 * retourner la première réponse valide (plus rapide et plus résilient).
 *
 * — Point d'entrée principal pour la récupération de POI OSM côté serveur
 * — Gestion multi-endpoints, timeout, et fallback automatique
 */

import { logger } from "../src/services/logger";

/**
 * Liste ordonnée des endpoints Overpass utilisés pour le proxy.
 */
const UPSTREAM_ENDPOINTS = [
  "https://overpass.karte.io/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

/**
 * Timeout maximum pour chaque requête Overpass (ms).
 */
const TIMEOUT_MS = 12_000;

/**
 * Tente une requête POST vers un endpoint Overpass donné, avec timeout.
 * @param url Endpoint Overpass
 * @param body Corps de la requête (form-urlencoded)
 * @returns Réponse texte brute
 * @throws Error si la réponse n'est pas JSON ou HTTP non 2xx
 */
async function tryEndpoint(url: string, body: string): Promise<string> {
  logger.debug("overpass", `Trying endpoint: ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "RoadStories/1.0 (https://github.com/GuillaumeBraillon/road-stories)",
      },
      body,
      signal: controller.signal,
    });

    logger.debug("overpass", `Endpoint ${url} responded with status ${response.status}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();

    // Certains endpoints renvoient une page HTML 200 en cas de rate-limit
    logger.debug("overpass", `Endpoint ${url} response starts with: ${text.slice(0, 100)}`);
    if (!text.trimStart().startsWith("{")) throw new Error("Response is not JSON");

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handler principal Vercel Edge: proxy POST vers Overpass, multi-endpoints, fallback.
 * @param request Requête HTTP entrante
 * @returns Réponse HTTP avec le JSON Overpass ou erreur
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    logger.debug("overpass", `Method Not Allowed: ${request.method}`);
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.text();

  try {
    const data = await Promise.any(UPSTREAM_ENDPOINTS.map((url) => tryEndpoint(url, body)));
    logger.debug("overpass", "Successfully retrieved data from Overpass.");
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof AggregateError ? err.errors.map(String).join(" | ") : String(err);
    return new Response(JSON.stringify({ error: `All Overpass endpoints failed: ${message}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
