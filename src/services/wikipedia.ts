/**
 * Service client de résolution et de cascade pour Wikipédia.
 * Implémente une stratégie descendante complète (Tags OSM -> Wikidata QID -> Moteur interne).
 * * @module services/wikipedia
 */

import { Type } from "@google/genai";
import { logger } from "./logger";

/**
 * Déclaration de l'outil pour le Function Calling de l'agent client.
 */
export const declaration = {
  name: "getWikipediaSummary",
  description: "Récupère l'introduction culturelle Wikipédia en français pour enrichir le récit.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: "Nom ou expression du lieu à analyser (ex: 'Château de Vizille').",
      },
    },
    required: ["title"],
  },
};

const WIKIPEDIA_ACTION_API = "https://fr.wikipedia.org/w/api.php";
const WIKIPEDIA_REST_API = "https://fr.wikipedia.org/api/rest_v1/page/summary";
const TIMEOUT_MS = 6_000;

interface WikipediaSummaryData {
  extract?: string;
  type?: string;
}

interface WikidataResponse {
  entities?: {
    [qid: string]: {
      sitelinks?: {
        frwiki?: { title: string };
      };
    };
  };
}

interface MediaWikiQueryResponse {
  query?: {
    pages: Record<string, { extract?: string }>;
  };
}

/**
 * Extrait le résumé direct via l'API REST simplifiée.
 * * @param {string} title - Titre officiel de l'article.
 * @param {AbortSignal} signal - Signal d'annulation pour le timeout.
 * @returns {Promise<string | null>} L'introduction textuelle ou null.
 */
async function fetchSummaryByTitle(title: string, signal: AbortSignal): Promise<string | null> {
  const slug = title.replace(/ /g, "_");
  const url = `${WIKIPEDIA_REST_API}/${encodeURIComponent(slug)}`;

  logger.debug("wikipedia", `[Fetch REST] Tentative d'accès au résumé : ${url}`);

  try {
    const response = await fetch(url, { signal });
    logger.debug("wikipedia", `[Fetch REST] Statut HTTP reçu : ${response.status} pour : ${title}`);

    if (!response.ok) return null;

    const data = (await response.json()) as WikipediaSummaryData;
    if (data.type === "disambiguation") {
      logger.warn("wikipedia", `[Fetch REST] Page d'homonymie ignorée : ${title}`);
      return null;
    }

    return data.extract ?? null;
  } catch (error) {
    logger.error("wikipedia", `[Fetch REST] Erreur réseau ou timeout sur : ${title}`, error);
    return null;
  }
}

/**
 * Résout un identifiant Wikidata (QID) en titre d'article francophone.
 * * @param {string} qid - Identifiant de l'entité (ex: Q12345).
 * @param {AbortSignal} signal - Signal d'annulation.
 * @returns {Promise<string | null>} Le titre en français ou null.
 */
async function getTitleByWikidataId(qid: string, signal: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: qid,
    props: "sitelinks",
    sitefilter: "frwiki",
    format: "json",
    origin: "*",
  });

  const url = `https://www.wikidata.org/w/api.php?${params.toString()}`;
  logger.debug("wikipedia", `[Wikidata] Résolution du QID ${qid} via : ${url}`);

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      logger.warn("wikipedia", `[Wikidata] Erreur HTTP ${response.status} pour le QID : ${qid}`);
      return null;
    }

    const data = (await response.json()) as WikidataResponse;
    const title = data.entities?.[qid]?.sitelinks?.frwiki?.title || null;

    if (title) {
      logger.debug("wikipedia", `[Wikidata] QID ${qid} résolu avec succès en titre : "${title}"`);
    } else {
      logger.warn("wikipedia", `[Wikidata] Aucun lien 'frwiki' trouvé pour le QID : ${qid}`);
    }

    return title;
  } catch (error) {
    logger.error("wikipedia", `[Wikidata] Échec de la requête pour le QID : ${qid}`, error);
    return null;
  }
}

/**
 * Recherche plein texte par mot-clé avec extraction d'introduction épurée (explaintext).
 * * @param {string} keyword - Expression textuelle à chercher.
 * @param {AbortSignal} signal - Signal d'annulation.
 * @returns {Promise<string | null>} Le contenu extrait de la première page trouvée ou null.
 */
async function searchByKeyword(keyword: string, signal: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: keyword,
    gsrlimit: "1",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
    format: "json",
    origin: "*",
  });

  logger.debug("wikipedia", `[Fallback Search] Lancement de la recherche plein texte pour : "${keyword}"`);

  try {
    const response = await fetch(`${WIKIPEDIA_ACTION_API}?${params.toString()}`, { signal });
    if (!response.ok) return null;

    const data = (await response.json()) as MediaWikiQueryResponse;
    const pages = data.query?.pages;
    if (!pages) {
      logger.warn("wikipedia", `[Fallback Search] Aucun résultat de recherche pour : "${keyword}"`);
      return null;
    }

    const firstKey = Object.keys(pages)[0];
    const extract = pages[firstKey]?.extract ?? null;

    if (extract) {
      logger.debug("wikipedia", `[Fallback Search] Correspondance trouvée pour : "${keyword}" (Page ID: ${firstKey})`);
    }
    return extract;
  } catch (error) {
    logger.error("wikipedia", `[Fallback Search] Erreur lors de la recherche pour : "${keyword}"`, error);
    return null;
  }
}

/**
 * Point d'entrée principal de l'outil Wikipédia côté application.
 * Exécute la cascade complète à partir des arguments de l'IA et des tags OSM injectés.
 * * @param {Record<string, unknown>} args - Arguments de la fonction Gemini enrichis par l'orchestrateur.
 * @returns {Promise<string>} Le texte informatif extrait ou "Non disponible".
 */
export async function execute(args: Record<string, unknown>): Promise<string> {
  const title = String(args["title"] ?? "").trim();
  const tags = (args["tags"] as Record<string, string>) || {};

  logger.debug("wikipedia", `=== DÉBUT CASCADE WIKIPEDIA === Lieu : "${title}" | Tags présents : ${Object.keys(tags).join(", ") || "aucun"}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.error("wikipedia", `[Timeout Global] La cascade Wikipédia a dépassé la limite de ${TIMEOUT_MS}ms`);
    controller.abort();
  }, TIMEOUT_MS);

  try {
    // 1. Cascade : Vérification du tag direct Wikipedia d'OpenStreetMap
    const wikipediaTag = tags["wikipedia"] || tags["subject:wikipedia"] || tags["network:wikipedia"];
    if (wikipediaTag) {
      logger.debug("wikipedia", `[Etape 1] Tag Wikipedia trouvé : "${wikipediaTag}"`);
      const exactTitle = wikipediaTag.includes(":") ? wikipediaTag.split(":").slice(1).join(":") : wikipediaTag;
      const summary = await fetchSummaryByTitle(exactTitle, controller.signal);
      if (summary) {
        logger.debug("wikipedia", `[Etape 1 Succès] Résumé extrait via le tag Wikipedia direct`);
        return summary;
      }
    }

    // 2. Cascade : Résolution par identifiant unique Wikidata (QID)
    const wikidataId = tags["wikidata"] || tags["subject:wikidata"] || tags["network:wikidata"];
    if (wikidataId && /^Q\d+$/.test(wikidataId)) {
      logger.debug("wikipedia", `[Etape 2] Tag Wikidata détecté : "${wikidataId}"`);
      const resolvedTitle = await getTitleByWikidataId(wikidataId, controller.signal);
      if (resolvedTitle) {
        const summary = await fetchSummaryByTitle(resolvedTitle, controller.signal);
        if (summary) {
          logger.debug("wikipedia", `[Etape 2 Succès] Résumé extrait après résolution Wikidata du QID : ${wikidataId}`);
          return summary;
        }
      }
    } else if (wikidataId) {
      logger.warn("wikipedia", `[Etape 2 Rejet] Format du QID Wikidata invalide : "${wikidataId}"`);
    }

    // 3. Cascade : Recherche par mot-clé textuel (Fallback final)
    const searchTarget = title || tags["name"];
    if (searchTarget) {
      logger.debug("wikipedia", `[Etape 3 Fallback] Tentative de secours textuelle sur la cible : "${searchTarget}"`);
      const fallbackSummary = await searchByKeyword(searchTarget, controller.signal);
      if (fallbackSummary) {
        logger.debug("wikipedia", `[Etape 3 Succès] Récit de secours récupéré pour : "${searchTarget}"`);
        return fallbackSummary;
      }
    }

    logger.warn("wikipedia", `=== ÉCHEC CASCADE === Aucun des niveaux de la cascade n'a renvoyé de données pour : "${title}"`);
    return "Non disponible";
  } catch (error) {
    logger.error("wikipedia", "Erreur fatale non interceptée pendant l'exécution de la cascade", error);
    return "Non disponible";
  } finally {
    clearTimeout(timeoutId);
  }
}
