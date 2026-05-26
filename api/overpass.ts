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

import { logger } from "./logger.js";

export const runtime = "edge";

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

interface NodeRequestLike {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}

interface NodeResponseLike {
  status: (code: number) => {
    setHeader: (k: string, v: string) => NodeResponseLike;
    send: (body: string) => void;
  };
  send: (body: string) => void;
}

/**
 * Tente une requête POST vers un endpoint Overpass donné, avec timeout.
 * @param url Endpoint Overpass
 * @param body Corps de la requête (form-urlencoded)
 * @returns Réponse texte brute
 * @throws Error si la réponse n'est pas JSON ou HTTP non 2xx
 */
async function tryEndpoint(url: string, body: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.error("overpass API", `⏱️ Timeout de ${TIMEOUT_MS}ms atteint pour ${url}`);
    controller.abort();
  }, TIMEOUT_MS);

  try {
    logger.debug("overpass API", `Envoi du fetch POST vers ${url} (Taille payload: ${body.length} chars)`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "RoadStories/1.0 (https://github.com/GuillaumeBraillon/road-stories)",
      },
      body,
      signal: controller.signal,
    });

    logger.debug("overpass API", `Réponse reçue de ${url} — Statut: ${response.status}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();

    // Validation stricte du format JSON (anti HTML / anti rate-limit masqué)
    if (!text.trimStart().startsWith("{")) {
      logger.error("overpass API", `❌ Rejet de ${url} : Le contenu retourné n'est pas du JSON valide.`);
      throw new Error("Response is not JSON");
    }

    logger.debug("overpass API", `✅ Données JSON validées avec succès pour ${url}`);
    return text;
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("overpass API", `💥 Échec sur l'endpoint ${url} : ${errorMsg}`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handler principal Vercel Edge: proxy POST vers Overpass, multi-endpoints, fallback.
 * @param request Requête HTTP entrante
 * @param response Réponse Node.js optionnelle pour le dev local
 * @returns Réponse HTTP avec le JSON Overpass ou erreur
 */
export default async function handler(request: Request | NodeRequestLike, response?: NodeResponseLike): Promise<Response | void> {
  logger.debug("overpass API", "Le Handler Overpass vient d'être déclenché par Vercel Dev !");

  // DETECTION RUNTIME : Si ce n'est pas une instance de Request, on est sous Node.js (Vercel Dev)
  const isNodeEnvironment = !(request instanceof Request);
  logger.debug("overpass API", `Mode d'exécution détecté : ${isNodeEnvironment ? "Node.js (Vercel Dev Local)" : "Edge Runtime (Vercel Production)"}`);

  let method: string;
  let rawBody: unknown;

  if (isNodeEnvironment) {
    const nodeRequest = request as NodeRequestLike;
    method = nodeRequest.method ?? "POST";
    rawBody = nodeRequest.body;
    logger.debug("overpass API", `Inspection du rawBody Node d'entrée — Type: ${typeof rawBody}`);
  } else {
    method = request.method;
  }

  const nodeResponse = response as NodeResponseLike | undefined;

  if (method !== "POST") {
    logger.error("overpass API", `❌ Méthode HTTP ${method} refusée. Seul le POST est autorisé.`);
    if (isNodeEnvironment && nodeResponse) {
      nodeResponse.status(405).send("Method Not Allowed");
      return;
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  let bodyStr = "";

  try {
    if (isNodeEnvironment) {
      // Cas où la CLI vercel dev a intercepté et parsé le x-www-form-urlencoded en objet clé/valeur
      if (rawBody && typeof rawBody === "object") {
        const record = rawBody as Record<string, string>;
        logger.debug("overpass API", `Parsing du body objet. Clés détectées: [${Object.keys(record).join(", ")}]`);

        if (record["data"]) {
          logger.debug("overpass API", "Clé 'data' isolée trouvée dans l'objet. Extraction de la requête Overpass QL.");
          bodyStr = `data=${encodeURIComponent(record["data"])}`;
        } else {
          logger.debug("overpass API", "Reconstruction complète de la chaîne urlencoded depuis l'objet multi-clés.");
          bodyStr = Object.keys(record)
            .map((key) => `${key}=${encodeURIComponent(record[key] ?? "")}`)
            .join("&");
        }
      } else if (typeof rawBody === "string") {
        logger.debug("overpass API", "Le body fourni en environnement Node est déjà une string brute.");
        bodyStr = rawBody;
      }
    } else {
      logger.debug("overpass API", "Lecture du flux de texte asynchrone (Web API Request.text)...");
      bodyStr = await (request as Request).text();
    }

    logger.debug("overpass API", `Longueur finale de la chaîne Overpass QL à envoyer : ${bodyStr.length} caractères.`);
    if (!bodyStr || bodyStr.trim() === "") throw new Error("Le corps de la requête HTTP (body) est totalement vide ou introuvable.");

    logger.debug("overpass API", `🔀 Lancement en parallèle de Promise.any() sur les ${UPSTREAM_ENDPOINTS.length} endpoints Overpass...`);
    const data = await Promise.any(UPSTREAM_ENDPOINTS.map((url) => tryEndpoint(url, bodyStr)));

    logger.debug("overpass API", "🎉 Succès global : Renvoi du JSON au client.");

    if (isNodeEnvironment && nodeResponse) {
      logger.debug("overpass API", "Émission du résultat via l'objet de réponse de l'environnement local Node.");
      nodeResponse.status(200).setHeader("Content-Type", "application/json").send(data);
      return;
    }

    logger.debug("overpass API", "Émission du résultat via la Web API Response (Edge Runtime).");
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof AggregateError ? err.errors.map(String).join(" | ") : String(err);
    logger.error("overpass API", `🔥 ÉCHEC CRITIQUE : Tous les endpoints Overpass ont échoué ou ont expiré. Détails : ${message}`);

    const errorPayload = JSON.stringify({ error: `All Overpass endpoints failed: ${message}` });

    if (isNodeEnvironment && nodeResponse) {
      nodeResponse.status(502).setHeader("Content-Type", "application/json").send(errorPayload);
      return;
    }

    return new Response(errorPayload, {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
