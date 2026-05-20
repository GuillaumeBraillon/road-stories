import { useState, useEffect } from "react";
import type { Coords } from "../types";
import { watchPosition, clearWatch } from "../services/geolocation";

// MODE DEV : position fixe près d'un monument connu
// Exemple : près du Pont du Gard (30210 Vers-Pont-du-Gard) { lat: 43.9467, lng: 4.5353 }
// Exemple : près de Saint-Victor-de-Cessieu (38110) { lat: 45.549618, lng: 5.369493 }
// Exemple : près de Lans en vercord { lat: 45.135866, lng: 5.584904 }
// Exemple : près de la magie des automates a lans en vercors { lat: 45.1325, lng: 5.5836 }
// Exemple : près de la ferme aux crocodiles a pierrelatte { lat: 44.3606, lng: 4.7172 }
// Exemple : près de la maison { lat: 45.749718247886484, lng: 4.85146085822667 }
// Exemple : près de vizille { lat: 45.07578247473352, lng: 5.773454278558929 }
const DEV_COORDS: Coords = { lat: 45.749718247886484, lng: 4.85146085822667 };

export function useGeolocation(): { coords: Coords | null; error: string | null } {
  const [coords, setCoords] = useState<Coords | null>(import.meta.env.DEV ? DEV_COORDS : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return;

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
