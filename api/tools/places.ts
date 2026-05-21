import type {
  GooglePlacesTextSearchRequest,
  GooglePlacesTextSearchResponse,
  GooglePriceLevel,
  GooglePlacesPlace,
  PlaceResult,
} from "../../src/types/places.types";

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

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.reviews,places.formattedAddress,places.types,places.googleMapsUri,places.websiteUri";
const SEARCH_RADIUS_M = 1500;
const MAX_RESULT_COUNT = 1;

const PRICE_LABELS: Record<GooglePriceLevel, string> = {
  PRICE_LEVEL_FREE: "Entrée gratuite",
  PRICE_LEVEL_INEXPENSIVE: "Peu coûteux",
  PRICE_LEVEL_MODERATE: "Prix modérés",
  PRICE_LEVEL_EXPENSIVE: "Entrée payante",
  PRICE_LEVEL_VERY_EXPENSIVE: "Entrée très coûteuse",
};

function formatPriceLevel(priceLevel: GooglePriceLevel | string | null): string | null {
  if (!priceLevel) return null;
  return PRICE_LABELS[priceLevel as GooglePriceLevel] ?? null;
}

function normalizeTopReview(place: GooglePlacesPlace): string | null {
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];
  if (reviews.length === 0) return null;

  const preferredReview = reviews.find((review) => review.languageCode === "fr") ?? reviews[0];
  if (!preferredReview?.text?.text) return null;

  return preferredReview.text.text.slice(0, 200);
}

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
