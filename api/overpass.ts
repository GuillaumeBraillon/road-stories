/**
 * Proxy Vercel Edge Function — Overpass API
 *
 * Résout les erreurs CORS : le fetch vers overpass-api.de s'effectue
 * côté serveur (serveur→serveur), sans restriction d'origine.
 * Accepte le même format que l'API Overpass directe (POST form-encoded).
 */

export const config = { runtime: "edge" };

const UPSTREAM_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const PER_ENDPOINT_TIMEOUT_MS = 9_000;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.text();
  let lastError = "unknown";

  for (const url of UPSTREAM_ENDPOINTS) {
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(PER_ENDPOINT_TIMEOUT_MS),
      });

      if (!upstream.ok) {
        lastError = `HTTP ${upstream.status} from ${url}`;
        continue;
      }

      const data = await upstream.text();
      return new Response(data, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      lastError = `${url} — ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return new Response(JSON.stringify({ error: `All Overpass endpoints failed: ${lastError}` }), {
    status: 502,
    headers: { "Content-Type": "application/json" },
  });
}
