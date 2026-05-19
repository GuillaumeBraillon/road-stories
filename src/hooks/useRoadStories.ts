import { useState, useEffect, useRef } from "react";
import type { AppStatus, Coords, Theme } from "../types";
import { useGeolocation } from "./useGeolocation";
import { getNearbyPOIs } from "../services/overpass";
import { getWikipediaSummary } from "../services/wikipedia";
import { generateRoadMessage } from "../services/gemini";
import { speak } from "../services/tts";
import { logger } from "../services/logger";

const POLL_INTERVAL_MS = 30_000;
const DETECTION_RADIUS_M = 500;

export function useRoadStories(themes: Theme[]): {
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  status: AppStatus;
  currentPOIName: string | null;
} {
  const [isActive, setIsActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentPOIName, setCurrentPOIName] = useState<string | null>(null);

  // status dérivé du render — aucun setState synchrone dans les effets
  const status: AppStatus = !isActive ? "idle" : isSpeaking ? "speaking" : "active";

  const { coords } = useGeolocation();

  // Refs pour éviter les stale closures dans l'interval
  const isSpeakingRef = useRef(false);
  const coordsRef = useRef<Coords | null>(null);
  const themesRef = useRef<Theme[]>(themes);
  const triggeredPOIs = useRef(new Set<string>());

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);
  useEffect(() => {
    themesRef.current = themes;
  }, [themes]);

  useEffect(() => {
    if (!isActive) return;

    // Wake Lock
    let wakeLock: WakeLockSentinel | null = null;
    navigator.wakeLock
      ?.request("screen")
      .then((wl) => {
        wakeLock = wl;
      })
      .catch(() => {});

    const tick = async () => {
      if (!coordsRef.current || isSpeakingRef.current) return;

      let didStartSpeaking = false;

      try {
        const pois = await getNearbyPOIs(coordsRef.current, DETECTION_RADIUS_M);
        const newPOI = pois.find((poi) => !triggeredPOIs.current.has(poi.id));

        if (!newPOI) return;

        triggeredPOIs.current.add(newPOI.id);
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        didStartSpeaking = true;
        setCurrentPOIName(newPOI.name);

        const enabledThemes = themesRef.current.filter((t) => t.enabled).map((t) => t.label);

        const wikipediaSummary = await getWikipediaSummary(newPOI.name);
        const message = await generateRoadMessage({
          poiName: newPOI.name,
          wikipediaSummary,
          enabledThemes,
        });

        await speak(message);
      } catch (error) {
        logger.error("Road Stories error:", error);
      } finally {
        if (didStartSpeaking) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
          setCurrentPOIName(null);
        }
      }
    };

    const intervalId = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      wakeLock?.release().catch(() => {});
    };
  }, [isActive]);

  return { isActive, setIsActive, status, currentPOIName };
}
