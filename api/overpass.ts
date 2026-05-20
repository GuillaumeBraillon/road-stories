/**
 * Proxy Vercel Edge Function — Overpass API
 *
 * Résout les erreurs CORS : le fetch vers Overpass s'effectue côté serveur.
 * Utilise Promise.any() pour lancer toutes les requêtes en parallèle et
 * retourner la première réponse valide (plus rapide et plus résilient).
 */

export const config = { runtime: "edge" };

const UPSTREAM_ENDPOINTS = [
  "https://overpass.karte.io/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const TIMEOUT_MS = 12_000;

async function tryEndpoint(url: string, body: string): Promise<string> {
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

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();

    // Certains endpoints renvoient une page HTML 200 en cas de rate-limit
    if (!text.trimStart().startsWith("{")) throw new Error("Response is not JSON");

    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.text();

  try {
    const data = await Promise.any(UPSTREAM_ENDPOINTS.map((url) => tryEndpoint(url, body)));
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
