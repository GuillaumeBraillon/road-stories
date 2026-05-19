import type { Coords, POI } from "../types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface OverpassNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassNode[];
}

function buildQuery(lat: number, lng: number, radiusMeters: number): string {
  const around = `(around:${radiusMeters},${lat},${lng})`;
  return `
    [out:json];
    (
      node["tourism"="information"]["information"="guidepost"]${around};
      node["historic"]${around};
      node["tourism"="attraction"]${around};
      node["natural"="peak"]${around};
      node["natural"="waterfall"]${around};
    );
    out;
  `.trim();
}

function nodeToPoI(node: OverpassNode): POI {
  const tags = node.tags ?? {};
  const name = tags["name:fr"] ?? tags["name"] ?? `OSM ${node.id}`;
  return {
    id: String(node.id),
    name,
    lat: node.lat,
    lng: node.lon,
    tags,
  };
}

export async function getNearbyPOIs(coords: Coords, radiusMeters: number = 500): Promise<POI[]> {
  const query = buildQuery(coords.lat, coords.lng, radiusMeters);

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const data: OverpassResponse = await response.json();
  return data.elements.filter((el) => el.lat !== undefined).map(nodeToPoI);
}
