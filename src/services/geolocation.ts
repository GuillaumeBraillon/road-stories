import type { Coords } from "../types";

const EARTH_RADIUS_M = 6_371_000;

export function watchPosition(onSuccess: (coords: Coords) => void, onError: (error: GeolocationPositionError) => void): number {
  return navigator.geolocation.watchPosition((position) => onSuccess({ lat: position.coords.latitude, lng: position.coords.longitude }), onError, {
    enableHighAccuracy: true,
    maximumAge: 10_000,
  });
}

export function clearWatch(watchId: number): void {
  navigator.geolocation.clearWatch(watchId);
}

export function calculateDistance(coord1: Coords, coord2: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(a));
}
