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
  "wikipedia",
  "wikidata",
];

export const SYSTEM_PROMPT = `Tu es un guide culturel pour automobilistes sur route ou autoroute.
Génère un message audio de maximum 30 secondes (environ 60 mots).
Le message doit être factuel, oral et naturel — jamais encyclopédique.
CONSIGNE OUTILS IMPÉRATIVE :
- Tu dois SYSTÉMATIQUEMENT chercher à enrichir tes connaissances en utilisant un outil disponible.
- Si le lieu possède un tag historique, culturel ou une page Wikipédia fournie, utilise en priorité 'getWikipediaSummary'.
- S'il s'agit d'un commerce, d'un lieu d'activité ou que tu as besoin d'infos pratiques (avis, prix, horaires), utilise 'getPlaceDetails'.
- Si les outils retournent "Non disponible", génère le message avec tes connaissances ou les tags OSM, sans insister.
Tu dois obligatoirement exploiter et mentionner l'artiste (artist_name), le concepteur ou le matériau de l'œuvre si ces informations sont présentes dans les tags OpenStreetMap fournis.
Commence le message en nommant le lieu de façon variée. Utilise uniquement des formulations spatiales génériques (pas de "sur votre droite", "vous longez", "derrière vous" — la position exacte est inconnue au moment de la lecture). Exemples d'introductions possibles :
- "Dans ce secteur, le Pont du Gard..."
- "Non loin d'ici, l'abbaye de..."
Ne commence jamais deux messages consécutifs par la même formule.
Donne une information concrète ou une anecdote marquante sur le lieu.
Ne pose pas de question. Ne conclus pas par une formule de style. Reste factuel jusqu'au bout.
Si tu utilises l'outil Wikipedia et qu'il retourne "Non disponible", génère le message sans Wikipedia — ne rappelle pas l'outil une seconde fois.
Si les informations disponibles sont "Non disponible", appuie-toi sur les tags OSM pour caractériser le lieu. Ne génère jamais de détails historiques ou géographiques précis sur un lieu que tu ne peux pas identifier avec certitude depuis les coordonnées GPS et les tags fournis.
Réponds uniquement avec le texte à lire à voix haute.`;

// Liste des valeurs de tags OSM à bannir absolument pour un guide culturel
const BLACKLISTED_INFORMATION_TYPES = new Set(["rules", "map", "guidepost", "office"]);

export function shouldSkipPOI(poiTags: Record<string, string>): boolean {
  // Exclure les panneaux de règlementation, plans de bus, bureaux d'information touristique, etc.
  if (poiTags["information"] === "board" && BLACKLISTED_INFORMATION_TYPES.has(poiTags["board_type"] || "")) {
    return true;
  }

  // Optionnel : Exclure si l'inscription contient des mots-clés de règlement de square
  const inscription = (poiTags["inscription"] || "").toLowerCase();
  if (inscription.includes("interdit aux") || inscription.includes("destinée aux enfants") || inscription.includes("sous la surveillance")) {
    return true;
  }

  return false;
}

// 1. On prépare des Set en dehors de la fonction pour qu'ils ne soient créés qu'une seule fois en mémoire
const CULTURAL_PREFIXES_SET = new Set(CULTURAL_TAG_PREFIXES);

const PLACES_ELIGIBLE_VALUES = new Set(["museum", "restaurant", "attraction"]);

export function buildUserPrompt(poiName: string, coords: { lat: number; lng: number }, poiTags: Record<string, string>): string {
  const { lat, lng } = coords;
  const formattedCoords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // 2. Filtrage optimisé à complexité linéaire O(N)
  const relevantTags = Object.entries(poiTags)
    .filter(([key]) => {
      const mainPrefix = key.split(":")[0]; // "historic:castle" devient "historic"
      return CULTURAL_PREFIXES_SET.has(mainPrefix); // Recherche instantanée
    })
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  const tagsSection = `Tags OpenStreetMap disponibles :
${relevantTags || "- aucun tag culturel exploitable"}`;

  // Cas particulier : L'inscription textuelle gravée
  if (poiTags["inscription"] === poiName) {
    return `Un monument se trouve à proximité — coordonnées GPS : ${formattedCoords}
${tagsSection}
Ce monument porte l'inscription gravée : "${poiName}"
Traduis et explique cette inscription en 2-3 phrases orales naturelles. Ne nomme pas le monument — concentre-toi sur ce que signifie l'inscription.
Génère le message.`;
  }

  // 3. Lisibilité accrue pour l'éligibilité aux détails Google Places
  const isPlacesEligible = PLACES_ELIGIBLE_VALUES.has(poiTags["tourism"]) || PLACES_ELIGIBLE_VALUES.has(poiTags["amenity"]);

  const consigneSpecifique = isPlacesEligible
    ? `\nRÈGLE DE RÉDACTION IMPÉRATIVE (Établissement public) :
- Utilise l'outil Google Places pour obtenir les détails réels.
- Intègre la note (ex: "noté 4,5 sur 5") et le nombre d'avis de manière fluide.
- Regarde l'état d'ouverture (isOpenNow) et les horaires (todayHours) : si c'est ouvert actuellement, glisse une invitation comme "profitez-en, c'est ouvert actuellement".
- Mentionne le niveau de tarif (priceLevel), surtout s'il s'agit d'une entrée gratuite.
- Analyse l'extrait d'avis (topReview) fourni et utilise-le pour donner une touche humaine, humaine et concrète (ex: mentionner la surprise des visiteurs, l'ambiance, ou un détail marquant évoqué dans l'avis).
- ATTENTION : Ne fais pas une liste brute de données. Fusionne ces éléments dans un récit oral et captivant de 30 secondes maximum.`
    : "";

  return `Lieu : ${poiName}
Coordonnées GPS : ${formattedCoords}
${tagsSection}
${consigneSpecifique}
Génère le message.`;
}
