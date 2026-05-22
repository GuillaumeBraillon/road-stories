/**
 * URL de base de l'API Wikipedia REST (résumés)
 */
const WIKIPEDIA_URL = "https://fr.wikipedia.org/api/rest_v1/page/summary";

/**
 * Timeout maximal pour les requêtes Wikipedia (ms)
 */
const TIMEOUT_MS = 5_000;

/**
 * Récupère le résumé d'une page Wikipedia en français
 * - 1ère tentative : titre tel quel (ex: "Pont du Gard")
 * - 2e tentative : titre en minuscules (pour les variantes)
 * - Ignore les pages d'homonymie et sans coordonnées
 *
 * @param title Titre de la page Wikipedia
 * @param signal Signal d'annulation (timeout)
 * @returns Résumé, null ou "not-found"
 */
async function fetchSummary(title: string, signal: AbortSignal): Promise<string | null | "not-found"> {
  const slug = title.replace(/ /g, "_");
  const response = await fetch(`${WIKIPEDIA_URL}/${encodeURIComponent(slug)}`, { signal });

  if (response.status === 404) return "not-found";
  if (!response.ok) throw new Error(`Wikipedia API error: ${response.status}`);

  const data: { extract?: string; type?: string; coordinates?: unknown } = (await response.json()) as {
    extract?: string;
    type?: string;
    coordinates?: unknown;
  };

  // Si la page est une page d'homonymie, on ne garde pas
  if (data.type === "disambiguation") return null;
  // Si la page n'est pas géolocalisée, on ne garde pas
  if (!data.coordinates) return null;

  return data.extract ?? null;
}

/**
 * Fonction principale pour obtenir un résumé Wikipedia
 * - Timeout 5s
 * - 2 tentatives (casse normale puis minuscule)
 * - Ignore les pages d'homonymie ou sans coordonnées
 *
 * @param title Titre de la page Wikipedia
 * @returns Résumé ou null
 */
export async function getWikipediaSummary(title: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // 1re tentative : titre tel quel (casse OSM préservée), ex: "Pont du Gard" → "Pont_du_Gard"
    const first = await fetchSummary(title, controller.signal);
    if (first !== "not-found") return first;

    // 2e tentative : tout en minuscules, ex: pour les noms d'opérateurs mal capitalisés
    const lower = title.toLowerCase();
    if (lower === title) return null; // inutile de réessayer si déjà identique
    const second = await fetchSummary(lower, controller.signal);
    if (second !== "not-found") return second;

    return null;
  } catch (error) {
    // Gestion des erreurs réseau classiques (timeout, fetch annulé, etc.)
    if (error instanceof DOMException && error.name === "AbortError") return null;
    if (error instanceof TypeError) return null;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
