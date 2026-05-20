/**
 * Proxy Vercel Edge Function — Overpass API
 *
 * Résout les erreurs CORS : le fetch vers overpass-api.de s'effectue
 * côté serveur (serveur→serveur), sans restriction d'origine.
 * Accepte le même format que l'API Overpass directe (POST form-encoded).
 */

export const config = { runtime: "edge" };

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.text();

  try {
    const upstream = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!upstream.ok) {
      return new Response(`Overpass upstream error: ${upstream.status}`, { status: upstream.status });
    }

    const data = await upstream.text();
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
