/**
 * Liste des préfixes de tags OSM considérés comme culturels ou informatifs pour la génération de messages.
 * Utilisé pour filtrer les tags pertinents à transmettre à l'IA.
 */
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

/**
 * Prompt système envoyé à Gemini pour cadrer la génération du message audio culturel.
 *
 * - Impose l'utilisation systématique des outils (Wikipedia, Google Places)
 * - Contraint la forme orale, factuelle, concise (max 30s)
 * - Donne des règles strictes sur l'exploitation des tags OSM et la formulation
 * - Précise la gestion des cas d'indisponibilité des outils
 */
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

/**
 * Instruction complémentaire pour forcer la réponse en JSON structuré (second tour Gemini).
 */
export const JSON_CONSOLIDATION_INSTRUCTION = `\nRenvoie TOUJOURS ta réponse finale au format JSON strict selon le schéma fourni. Si les informations fournies par un outil ne t'ont pas servi à enrichir le récit final, exclus cet outil de la liste.`;

/**
 * Schéma de validation de la réponse finale de l'agent (second tour Gemini).
 */
export const RESPONSE_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    message: {
      type: "STRING",
      description: "Le récit fluide du lieu. Inclus impérativement l'artiste et les matériaux s'ils sont fournis dans les tags OSM.",
    },
    actualToolsUsed: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Les noms des outils (ex: 'getWikipediaSummary') dont les infos ont été VRAIMENT utiles pour rédiger le message.",
    },
  },
  required: ["message", "actualToolsUsed"],
};

const CULTURAL_PREFIXES_SET = new Set(CULTURAL_TAG_PREFIXES);

/**
 * Valeurs de tags OSM qui rendent un lieu éligible à un enrichissement Google Places.
 * Couvre les établissements visitables : musées, châteaux, monuments, attractions, restaurants.
 */
const PLACES_ELIGIBLE_VALUES = new Set(["museum", "restaurant", "attraction", "castle", "monument", "historic"]);

/**
 * Génère le prompt utilisateur transmis à Gemini pour chaque POI.
 *
 * - Sélectionne et formate les tags OSM pertinents (culturels)
 * - Gère le cas particulier des inscriptions gravées ("inscription")
 * - Ajoute une consigne spécifique si le lieu est un établissement public (Google Places)
 *
 * @param poiName Nom du point d'intérêt (POI)
 * @param coords Coordonnées GPS du POI
 * @param poiTags Ensemble des tags OSM du POI
 * @returns Prompt utilisateur prêt à être envoyé à Gemini
 */
export function buildUserPrompt(poiName: string, coords: { lat: number; lng: number }, poiTags: Record<string, string>): string {
  const { lat, lng } = coords;
  const formattedCoords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // Filtrage des tags OSM pertinents pour la culture
  const relevantTags = Object.entries(poiTags)
    .filter(([key]) => CULTURAL_PREFIXES_SET.has(key.split(":")[0]))
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  const tagsSection = `Tags OpenStreetMap disponibles :\n${relevantTags || "- aucun tag culturel exploitable"}`;

  // Cas particulier : inscription gravée
  if (poiTags["inscription"] === poiName) {
    return `Un monument se trouve à proximité — coordonnées GPS : ${formattedCoords}\n${tagsSection}\nCe monument porte l'inscription gravée : "${poiName}"\nTraduis et explique cette inscription en 2-3 phrases orales naturelles. Ne nomme pas le monument — concentre-toi sur ce que signifie l'inscription.\nGénère le message.`;
  }

  // Éligibilité Google Places : tourism, amenity ou historic
  const isPlacesEligible =
    PLACES_ELIGIBLE_VALUES.has(poiTags["tourism"] ?? "") ||
    PLACES_ELIGIBLE_VALUES.has(poiTags["amenity"] ?? "") ||
    PLACES_ELIGIBLE_VALUES.has(poiTags["historic"] ?? "");

  const consigneSpecifique = isPlacesEligible
    ? `\nRÈGLE DE RÉDACTION IMPÉRATIVE (Établissement public) :
- Utilise l'outil Google Places pour obtenir les détails réels.
- Intègre la note (ex: "noté 4,5 sur 5") et le nombre d'avis de manière fluide.
- Regarde l'état d'ouverture (isOpenNow) et les horaires (todayHours) : si c'est ouvert actuellement, glisse une invitation comme "profitez-en, c'est ouvert actuellement".
- Mentionne le niveau de tarif (priceLevel), surtout s'il s'agit d'une entrée gratuite.
- Analyse l'extrait d'avis (topReview) fourni et utilise-le pour donner une touche humaine et concrète.
- ATTENTION : Ne fais pas une liste brute de données. Fusionne ces éléments dans un récit oral et captivant de 30 secondes maximum.`
    : "";

  return `Lieu : ${poiName}\nCoordonnées GPS : ${formattedCoords}\n${tagsSection}\n${consigneSpecifique}\nGénère le message.`;
}
