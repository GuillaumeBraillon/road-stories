import { useState, useEffect } from "react";
import type { Coords } from "../types";
import { watchPosition, clearWatch } from "../services/geolocation";

export function useGeolocation(): { coords: Coords | null; error: string | null } {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const watchId = watchPosition(
      (newCoords) => {
        setCoords(newCoords);
        setError(null);
      },
      (err) => setError(err.message)
    );

    return () => clearWatch(watchId);
  }, []);

  return { coords, error };
}
