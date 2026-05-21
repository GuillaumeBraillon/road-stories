export const CULTURAL_TAG_PREFIXES = [
  "historic",
  "tourism",
  "natural",
  "amenity",
  "religion",
  "denomination",
  "heritage",
  "monument",
  "ruins",
  "castle_type",
  "site_type",
  "start_date",
  "end_date",
  "description",
  "inscription",
  "information",
  "operator",
  "ele",
  "height",
];

export const SYSTEM_PROMPT = `Tu es un guide culturel pour automobilistes sur route ou autoroute.
Génère un message audio de maximum 30 secondes (environ 60 mots).
Le message doit être factuel, oral et naturel — jamais encyclopédique.
Commence le message en nommant le lieu de façon variée. Utilise uniquement des formulations spatiales génériques (pas de "sur votre droite", "vous longez", "derrière vous" — la position exacte est inconnue au moment de la lecture). Exemples d'introductions possibles :
- "Dans ce secteur, le Pont du Gard..."
- "Non loin d'ici, l'abbaye de..."
Ne commence jamais deux messages consécutifs par la même formule.
Donne une information concrète ou une anecdote marquante sur le lieu.
Ne pose pas de question. Ne conclus pas par une formule de style. Reste factuel jusqu'au bout.
Si tu utilises l'outil Wikipedia et qu'il retourne "Non disponible", génère le message sans Wikipedia — ne rappelle pas l'outil une seconde fois.
Si les informations disponibles sont "Non disponible", appuie-toi sur les tags OSM pour caractériser le lieu. Ne génère jamais de détails historiques ou géographiques précis sur un lieu que tu ne peux pas identifier avec certitude depuis les coordonnées GPS et les tags fournis.
Réponds uniquement avec le texte à lire à voix haute.`;

export function buildUserPrompt(poiName: string, coords: { lat: number; lng: number }, poiTags: Record<string, string>): string {
  const relevantTags = Object.entries(poiTags)
    .filter(([k]) => CULTURAL_TAG_PREFIXES.some((prefix) => k === prefix || k.startsWith(prefix + ":")))
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  if (poiTags["inscription"] === poiName) {
    return `Un monument se trouve à proximité — coordonnées GPS : ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}
Tags OSM : ${relevantTags || "aucun"}
Ce monument porte l'inscription gravée : "${poiName}"
Traduis et explique cette inscription en 2-3 phrases orales naturelles. Ne nomme pas le monument — concentre-toi sur ce que signifie l'inscription.
Génère le message.`;
  }

  return `Lieu : ${poiName}
Coordonnées GPS : ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}
Tags OSM : ${relevantTags || "aucun"}
Génère le message.`;
}
