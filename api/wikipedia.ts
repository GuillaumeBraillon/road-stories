//api/wikipedia.ts
/**
 * Outil et Endpoint Vercel Edge — Wikipédia Cascade
 * Communique avec l'API Action et l'API REST de Wikipédia pour extraire des résumés.
 * Supporte le Function Calling Gemini et les requêtes HTTP directes (Postman).
 */

import { logger } from "./logger.js";

export const runtime = "edge";

/**
 * Déclaration de l'outil destinée au Function Calling de l'API Gemini REST.
 */
export const declaration = {
  name: "getWikipediaSummary",
  description: "Récupère l'introduction culturelle et historique Wikipédia en français pour enrichir le récit à partir d'un nom de lieu.",
  parameters: {
    type: "OBJECT",
    properties: {
      title: {
        type: "STRING",
        description: "Nom ou expression du lieu à analyser (ex: 'Château de Vizille', 'Pont du Gard').",
      },
    },
    required: ["title"],
  },
};

const WIKIPEDIA_ACTION_API = "https://fr.wikipedia.org/w/api.php";
const WIKIPEDIA_REST_API = "https://fr.wikipedia.org/api/rest_v1/page/summary";
const TIMEOUT_MS = 6_000;

interface WikipediaRestSummary {
  type?: string;
  extract?: string;
}

interface MediaWikiSearchResponse {
  query?: {
    search?: Array<{
      title: string;
      pageid: number;
    }>;
  };
}

interface NodeRequestLike {
  method?: string;
  body?: unknown;
}

interface NodeResponseLike {
  status: (code: number) => {
    setHeader: (k: string, v: string) => NodeResponseLike;
    send: (body: string) => void;
  };
  send: (body: string) => void;
}

/**
 * Recherche textuelle par mot-clé (Action API)
 */
async function searchPageTitle(keyword: string, signal: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: keyword,
    srlimit: "1",
    format: "json",
    origin: "*",
  });

  try {
    const response = await fetch(`${WIKIPEDIA_ACTION_API}?${params.toString()}`, { signal });
    logger.debug("wikipedia", `[WIKIPEDIA API] Recherche du titre pour "${keyword}" — Statut: ${response.status}`);
    if (!response.ok) return null;
    const data = (await response.json()) as MediaWikiSearchResponse;
    logger.debug("wikipedia", `[WIKIPEDIA API] Résultat de recherche pour "${keyword}":`, data);
    return data.query?.search?.[0]?.title ?? null;
  } catch (error) {
    logger.error("wikipedia", `[WIKIPEDIA API] Échec de la recherche pour "${keyword}":`, error);
    return null;
  }
}

/**
 * Récupération du résumé par titre exact (TOOL-WIKIPEDIA)
 */
async function fetchSummaryByTitle(pageTitle: string, signal: AbortSignal): Promise<string | null> {
  logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Tentative de récupération du résumé pour "${pageTitle}"`);
  const slug = pageTitle.replace(/ /g, "_");
  try {
    const response = await fetch(`${WIKIPEDIA_REST_API}/${encodeURIComponent(slug)}`, {
      headers: { "User-Agent": "RoadStories/1.0" },
      signal,
    });
    logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Réponse pour "${pageTitle}" — Statut: ${response.status}`);
    if (!response.ok) return null;
    const data = (await response.json()) as WikipediaRestSummary;
    logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Données reçues pour "${pageTitle}"`);
    if (data.type === "disambiguation") return null;
    return data.extract ?? null;
  } catch (error) {
    logger.error("wikipedia", `[TOOL-WIKIPEDIA] Échec du résumé pour "${pageTitle}":`, error);
    return null;
  }
}

/**
 * Coeur de l'exécution (appelé par l'agent Gemini)
 */
export async function execute(args: Record<string, unknown>): Promise<string> {
  const title = String(args["title"] ?? "").trim();
  logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Exécution demandée pour le titre: "${title}"`);
  if (!title) return "Nom de lieu manquant.";

  logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Cascade lancée pour : "${title}"`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Étape 1 : REST Direct
    let summary = await fetchSummaryByTitle(title, controller.signal);
    logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Résumé direct pour "${title}":`, summary);
    if (summary?.trim()) return summary;

    // Étape 2 : Moteur de recherche de secours
    const resolvedTitle = await searchPageTitle(title, controller.signal);
    logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Titre résolu pour "${title}":`, resolvedTitle);
    if (resolvedTitle) {
      summary = await fetchSummaryByTitle(resolvedTitle, controller.signal);
      logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Résumé après recherche pour "${title}":`, summary);
      if (summary?.trim()) return summary;
    }

    logger.debug("wikipedia", `[TOOL-WIKIPEDIA] Aucun résumé trouvé pour "${title}" après cascade complète.`);
    return "Informations culturelles non disponibles.";
  } catch (error) {
    logger.error("wikipedia", `[TOOL-WIKIPEDIA] Erreur lors de l'exécution pour "${title}":`, error);
    return "Erreur lors de la récupération Wikipédia.";
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handler HTTP principal (appelé par Postman ou curl)
 */
export default async function handler(request: Request | NodeRequestLike, response?: NodeResponseLike): Promise<Response | void> {
  logger.debug("wikipedia", "[API-WIKIPEDIA] 📥 Requête HTTP reçue.");

  const isNodeEnvironment = !(request instanceof Request);
  let method: string;
  let rawBody: unknown;

  if (isNodeEnvironment) {
    const nodeReq = request as NodeRequestLike;
    method = nodeReq.method ?? "POST";
    rawBody = nodeReq.body;
  } else {
    method = request.method;
  }

  logger.debug("wikipedia", `[API-WIKIPEDIA] Méthode HTTP: ${method}`);
  const nodeResponse = response as NodeResponseLike | undefined;

  logger.debug("wikipedia", `[API-WIKIPEDIA] Inspection du rawBody d'entrée — Type: ${typeof rawBody}`);
  if (method !== "POST") {
    if (isNodeEnvironment && nodeResponse) {
      nodeResponse.status(405).send("Method Not Allowed");
      return;
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    let params: { title?: string } = {};

    if (isNodeEnvironment) {
      params = typeof rawBody === "string" ? JSON.parse(rawBody) : (rawBody as typeof params);
    } else {
      params = (await (request as Request).json()) as typeof params;
    }

    const title = params?.title ?? "";
    logger.debug("wikipedia", `[API-WIKIPEDIA] Titre extrait du body: "${title}"`);

    // On appelle la fonction d'exécution du tool
    const resultText = await execute({ title });
    const payload = JSON.stringify({ summary: resultText });

    if (isNodeEnvironment && nodeResponse) {
      nodeResponse.status(200).setHeader("Content-Type", "application/json").send(payload);
      return;
    }

    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error("wikipedia", "[API-WIKIPEDIA] Erreur lors du traitement de la requête:", err);
    const errorPayload = JSON.stringify({ error: "Invalid JSON body or processing failed" });
    if (isNodeEnvironment && nodeResponse) {
      nodeResponse.status(400).setHeader("Content-Type", "application/json").send(errorPayload);
      return;
    }
    return new Response(errorPayload, { status: 400, headers: { "Content-Type": "application/json" } });
  }
}
