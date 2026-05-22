import type {
  GooglePlacesTextSearchRequest,
  GooglePlacesTextSearchResponse,
  GooglePriceLevel,
  GooglePlacesPlace,
  PlaceResult,
} from "../../src/types/places.types";

/**
 * Déclaration du tool Gemini pour récupérer les détails Google Places d'un lieu public.
 * Utilisé côté agent Gemini (tool use).
 */
export const declaration = {
  name: "getPlaceDetails",
  description:
    "Récupère depuis Google Places la note, les horaires, l'adresse et les tarifs. À appeler uniquement pour les lieux visitables par le public (musées, châteaux, parcs aménagés). Ne PAS appeler pour des éléments naturels sans infrastructure.",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "Nom exact du lieu tel qu'il apparaît sur OSM" },
      lat: { type: "NUMBER", description: "Latitude du lieu" },
      lng: { type: "NUMBER", description: "Longitude du lieu" },
    },
    required: ["name", "lat", "lng"],
  },
};

/**
 * URL de l'API Google Places REST.
 */
const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
/**
 * Champs à récupérer pour chaque lieu (fieldMask Google Places).
 */
const FIELD_MASK =
  "places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.reviews,places.formattedAddress,places.types,places.googleMapsUri,places.websiteUri";
/**
 * Rayon de recherche (mètres) autour du POI.
 */
const SEARCH_RADIUS_M = 1500;
/**
 * Nombre maximum de résultats à retourner (1 = le plus pertinent).
 */
const MAX_RESULT_COUNT = 1;

/**
 * Libellés utilisateur pour chaque niveau de prix Google Places.
 */
const PRICE_LABELS: Record<GooglePriceLevel, string> = {
  PRICE_LEVEL_FREE: "Entrée gratuite",
  PRICE_LEVEL_INEXPENSIVE: "Peu coûteux",
  PRICE_LEVEL_MODERATE: "Prix modérés",
  PRICE_LEVEL_EXPENSIVE: "Entrée payante",
  PRICE_LEVEL_VERY_EXPENSIVE: "Entrée très coûteuse",
};

/**
 * Formate le niveau de prix Google Places en libellé utilisateur.
 * @param priceLevel Niveau de prix Google Places
 * @returns Libellé ou null
 */
function formatPriceLevel(priceLevel: GooglePriceLevel | string | null): string | null {
  if (!priceLevel) return null;
  return PRICE_LABELS[priceLevel as GooglePriceLevel] ?? null;
}

/**
 * Extrait l'avis utilisateur le plus pertinent (français prioritaire, max 200 caractères).
 * @param place Lieu Google Places
 * @returns Texte de l'avis ou null
 */
function normalizeTopReview(place: GooglePlacesPlace): string | null {
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];
  if (reviews.length === 0) return null;

  const preferredReview = reviews.find((review) => review.languageCode === "fr") ?? reviews[0];
  if (!preferredReview?.text?.text) return null;

  return preferredReview.text.text.slice(0, 200);
}

/**
 * Transforme un objet GooglePlacesPlace en PlaceResult normalisé pour l'app.
 * @param place Lieu Google Places
 * @returns PlaceResult formaté
 */
function toPlaceResult(place: GooglePlacesPlace): PlaceResult {
  const formatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "Europe/Paris" });
  const currentDayName = formatter.format(new Date());
  const formattedDayName = currentDayName.charAt(0).toUpperCase() + currentDayName.slice(1);
  const todayHours = place.currentOpeningHours?.weekdayDescriptions?.find((desc) => desc.startsWith(formattedDayName)) ?? null;

  return {
    rating: typeof place.rating === "number" ? place.rating : null,
    userRatingCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    isOpenNow: typeof place.currentOpeningHours?.openNow === "boolean" ? place.currentOpeningHours.openNow : null,
    todayHours,
    priceLevel: place.priceLevel ?? null,
    topReview: normalizeTopReview(place),
    address: place.formattedAddress ?? null,
    types: Array.isArray(place.types) ? place.types : null,
    googleMapsUri: place.googleMapsUri ?? null,
    websiteUri: place.websiteUri ?? null,
  };
}

async function getPlaceDetails(name: string, lat: number, lng: number): Promise<PlaceResult | null | "missing-api-key"> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.VITE_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("Erreur : La clé GOOGLE_PLACES_API_KEY est introuvable.");
    return "missing-api-key";
  }

  const latDelta = SEARCH_RADIUS_M / 111320;
  const lngDelta = SEARCH_RADIUS_M / (111320 * Math.cos((lat * Math.PI) / 180));

  const payload: GooglePlacesTextSearchRequest = {
    textQuery: name,
    locationRestriction: {
      rectangle: {
        low: { latitude: lat - latDelta, longitude: lng - lngDelta },
        high: { latitude: lat + latDelta, longitude: lng + lngDelta },
      },
    },
    maxResultCount: MAX_RESULT_COUNT,
    languageCode: "fr",
  };

  const response = await fetch(GOOGLE_PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as GooglePlacesTextSearchResponse;
  const firstPlace = data.places?.[0];
  return firstPlace ? toPlaceResult(firstPlace) : null;
}

export async function execute(args: Record<string, unknown>): Promise<string> {
  const name = String(args["name"] ?? "");
  const lat = Number(args["lat"]);
  const lng = Number(args["lng"]);

  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
    return "Arguments manquants pour l'appel de fonction";
  }

  try {
    const result = await getPlaceDetails(name, lat, lng);
    if (result === "missing-api-key") return "Informations Google Places non disponibles (Configuration serveur requise).";
    if (!result) return "Informations Google Places non disponibles pour ce lieu";

    return `Nom: ${name}
Adresse: ${result.address ?? "non disponible"}
Note: ${result.rating}/5 (${result.userRatingCount} avis)
Ouvert maintenant: ${result.isOpenNow ? "oui" : "non"}
Horaires aujourd'hui: ${result.todayHours ?? "non disponibles"}
Tarifs: ${formatPriceLevel(result.priceLevel) ?? "non renseignés"}
Extrait d'un avis: ${result.topReview ?? "aucun avis disponible"}`;
  } catch {
    return "Informations Google Places non disponibles pour ce lieu";
  }
}
