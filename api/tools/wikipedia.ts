/**
 * Déclaration du tool Gemini pour récupérer un résumé Wikipedia en français.
 * Utilisé côté agent Gemini (tool use).
 */
export const declaration = {
  name: "getWikipediaSummary",
  description: "Récupère le résumé Wikipedia en français d'un lieu",
  parameters: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "Nom du lieu à rechercher sur Wikipedia" },
    },
    required: ["title"],
  },
};

/**
 * URL de l'API Wikipedia REST.
 */
const WIKIPEDIA_URL = "https://fr.wikipedia.org/api/rest_v1/page/summary";
/**
 * Timeout maximum pour la requête Wikipedia (ms).
 */
const TIMEOUT_MS = 5_000;

/**
 * Récupère le résumé Wikipedia pour un titre donné (avec gestion du timeout et des cas d'ambiguïté).
 * @param title Titre de la page Wikipedia
 * @param signal AbortSignal pour le timeout
 * @returns Résumé, null, ou "not-found"
 */
async function fetchSummary(title: string, signal: AbortSignal): Promise<string | null | "not-found"> {
  const slug = title.replace(/ /g, "_");
  const response = await fetch(`${WIKIPEDIA_URL}/${encodeURIComponent(slug)}`, { signal });

  if (response.status === 404) return "not-found";
  if (!response.ok) throw new Error(`Wikipedia HTTP ${response.status}`);

  const data = (await response.json()) as { extract?: string; type?: string; coordinates?: unknown };
  if (data.type === "disambiguation") return null;
  if (!data.coordinates) return null;

  return data.extract ?? null;
}

/**
 * Exécute le tool Gemini Wikipedia côté agent (tool use).
 * @param args { title: string }
 * @returns Résumé Wikipedia ou "Non disponible"
 */
export async function execute(args: Record<string, unknown>): Promise<string> {
  const title = String(args["title"] ?? "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const first = await fetchSummary(title, controller.signal);
    if (first !== "not-found") return first ?? "Non disponible";

    const lower = title.toLowerCase();
    if (lower === title) return "Non disponible";

    const second = await fetchSummary(lower, controller.signal);
    if (second !== "not-found") return second ?? "Non disponible";

    return "Non disponible";
  } catch {
    return "Non disponible";
  } finally {
    clearTimeout(timeoutId);
  }
}
