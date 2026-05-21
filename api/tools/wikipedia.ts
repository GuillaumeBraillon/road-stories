// Pas d'import @google/genai — déclaration en JSON brut compatible Gemini REST API et Edge Runtime

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

const WIKIPEDIA_URL = "https://fr.wikipedia.org/api/rest_v1/page/summary";
const TIMEOUT_MS = 5_000;

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
