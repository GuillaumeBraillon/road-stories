const WIKIPEDIA_URL = "https://fr.wikipedia.org/api/rest_v1/page/summary";
const TIMEOUT_MS = 5_000;

export async function getWikipediaSummary(title: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${WIKIPEDIA_URL}/${encodeURIComponent(title)}`, { signal: controller.signal });

    if (response.status === 404) return null;

    if (!response.ok) {
      throw new Error(`Wikipedia API error: ${response.status}`);
    }

    const data: { extract?: string } = await response.json();
    return data.extract ?? null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    if (error instanceof TypeError) return null; // erreur réseau
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
