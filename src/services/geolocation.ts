import type { Coords } from "../types";

/**
 * Rayon moyen de la Terre en mètres (utilisé pour le calcul de distance Haversine)
 */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Surveille la position GPS de l'utilisateur en temps réel.
 * - Appelle onSuccess à chaque mise à jour de position
 * - Appelle onError en cas d'échec
 * - Utilise enableHighAccuracy pour une meilleure précision
 * - maximumAge : 10s pour éviter les valeurs trop anciennes
 *
 * @returns L'identifiant du watcher (à passer à clearWatch)
 */
export function watchPosition(onSuccess: (coords: Coords) => void, onError: (error: GeolocationPositionError) => void): number {
  return navigator.geolocation.watchPosition((position) => onSuccess({ lat: position.coords.latitude, lng: position.coords.longitude }), onError, {
    enableHighAccuracy: true,
    maximumAge: 10_000,
  });
}

/**
 * Arrête la surveillance GPS démarrée par watchPosition
 */
export function clearWatch(watchId: number): void {
  navigator.geolocation.clearWatch(watchId);
}

/**
 * Calcule la distance (en mètres) entre deux coordonnées GPS
 * Utilise la formule de Haversine (distance orthodromique)
 *
 * @param coord1 Premier point { lat, lng }
 * @param coord2 Deuxième point { lat, lng }
 * @returns Distance en mètres
 */
export function calculateDistance(coord1: Coords, coord2: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(a));
}
