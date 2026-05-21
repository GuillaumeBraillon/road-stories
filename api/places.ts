import type { GooglePlacesPlace, GooglePlacesTextSearchRequest, GooglePlacesTextSearchResponse, PlacesProxyErrorBody, PlaceResult } from "../src/types";

export const config = { runtime: "edge" };

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.reviews,places.formattedAddress,places.types,places.googleMapsUri,places.websiteUri";
const SEARCH_RADIUS_M = 1500;
const MAX_RESULT_COUNT = 1;

function normalizeTopReview(place: GooglePlacesPlace): string | null {
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];
  if (reviews.length === 0) return null;

  const preferredReview = reviews.find((review) => review.languageCode === "fr") ?? reviews[0];
  if (!preferredReview?.text?.text) return null;

  return preferredReview.text.text.slice(0, 200);
}

function toPlaceResult(place: GooglePlacesPlace): PlaceResult {
  // Correction Fuseau Horaire + Alignement Index Google
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

export default async function handler(request: Request): Promise<Response> {
  try {
    // Changement ici : On accepte uniquement le GET
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // Récupération des paramètres de l'URL (?name=...&lat=...&lng=...)
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name")?.trim();
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));

    if (!name || Number.isNaN(lat) || Number.isNaN(lng)) {
      const payload: PlacesProxyErrorBody = { error: "Missing or invalid query parameters (name, lat, lng)" };
      return new Response(JSON.stringify(payload), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not configured");

    // Calcul mathématique du rectangle (requis par Google pour locationRestriction)
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

    const upstreamResponse = await fetch(GOOGLE_PLACES_URL, {
      method: "POST", // L'appel sortant vers Google reste un POST (imposé par Google)
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(payload),
    });

    if (!upstreamResponse.ok) {
      const details = await upstreamResponse.text();
      throw new Error(`Google Places HTTP ${upstreamResponse.status}${details ? `: ${details}` : ""}`);
    }

    const data = (await upstreamResponse.json()) as GooglePlacesTextSearchResponse;
    const firstPlace = data.places?.[0];

    if (!firstPlace) {
      const notFound: PlacesProxyErrorBody = { error: "Place not found" };
      return new Response(JSON.stringify(notFound), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = toPlaceResult(firstPlace);

    // En-tête de cache magique pour Vercel (24h sur le CDN global)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload: PlacesProxyErrorBody = { error: message };
    return new Response(JSON.stringify(payload), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
