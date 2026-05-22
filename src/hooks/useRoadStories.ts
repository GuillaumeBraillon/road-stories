import { useState, useEffect, useRef } from "react";
import type { AppSettings, AppStatus, Coords, POI, PoiHistoryEntry, Theme } from "../types";
import { useGeolocation } from "./useGeolocation";
import { getNearbyPOIs } from "../services/overpass";
import { calculateDistance } from "../services/geolocation";
import { generateRoadMessage } from "../services/gemini";
import { speak, stop } from "../services/tts";
import { logger } from "../services/logger";
import { usePoiHistory } from "./usePoiHistory";
import { shouldSkipPOI } from "../services/poiFilter";

export function useRoadStories(
  themes: Theme[],
  settings: AppSettings
): {
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  status: AppStatus;
  currentPOIName: string | null;
  currentMessage: string | null;
  currentToolsUsed: string[];
  isMuted: boolean;
  setIsMuted: (value: boolean) => void;
  history: PoiHistoryEntry[];
  deleteHistoryEntry: (index: number) => void;
} {
  const [isActive, setIsActive] = useState(false);
  const [activeStatus, setActiveStatus] = useState<Exclude<AppStatus, "idle">>("listening");
  const [currentPOIName, setCurrentPOIName] = useState<string | null>(null);
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [currentToolsUsed, setCurrentToolsUsed] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const { history, addHistoryEntry, deleteHistoryEntry, hasTriggeredPOI, markPOITriggered } = usePoiHistory();

  const status: AppStatus = isActive ? activeStatus : "idle";
  const { coords } = useGeolocation();

  const isSpeakingRef = useRef(false);
  const isTickRunning = useRef(false);
  const coordsRef = useRef<Coords | null>(null);
  const themesRef = useRef<Theme[]>(themes);
  const overpassCache = useRef<{ coords: Coords; themesKey: string; pois: POI[] } | null>(null);
  const isMutedRef = useRef(false);
  const settingsRef = useRef(settings);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);
  useEffect(() => {
    themesRef.current = themes;
  }, [themes]);
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted) stop();
  }, [isMuted]);
  useEffect(() => {
    settingsRef.current = settings;
    overpassCache.current = null;
  }, [settings]);

  useEffect(() => {
    if (!isActive) return;

    let wakeLock: WakeLockSentinel | null = null;
    navigator.wakeLock
      ?.request("screen")
      .then((wl) => {
        wakeLock = wl;
      })
      .catch(() => {});

    const tick = async () => {
      if (isTickRunning.current) return;
      isTickRunning.current = true;
      let didStartSpeaking = false;

      try {
        logger.debug("tick", "coords:", coordsRef.current, "speaking:", isSpeakingRef.current);
        if (!coordsRef.current || isSpeakingRef.current) return;

        const currentCoords = coordsRef.current;
        const themesKey = themesRef.current
          .filter((t) => t.enabled)
          .map((t) => t.id)
          .join(",");
        const cache = overpassCache.current;
        const hasMoved = !cache || calculateDistance(currentCoords, cache.coords) > settingsRef.current.overpassMoveThresholdM;
        const themesChanged = !cache || cache.themesKey !== themesKey;

        let pois: POI[];
        if (hasMoved || themesChanged) {
          setActiveStatus("searching");
          pois = await getNearbyPOIs(currentCoords, themesRef.current, settingsRef.current.detectionRadiusM);
          overpassCache.current = { coords: currentCoords, themesKey, pois };
          logger.debug(
            "tick",
            `${pois.length} POI(s) trouvés`,
            pois.map((p) => p.name)
          );
        } else {
          pois = cache.pois;
          logger.debug(
            "tick",
            `${pois.length} POI(s) en cache`,
            pois.map((p) => p.name)
          );
        }

        // Filtrage — délégué à poiFilter.ts
        let newPOI: POI | undefined;
        for (const poi of pois) {
          if (hasTriggeredPOI(poi.id)) continue;
          if (shouldSkipPOI(poi.tags)) {
            logger.debug("tick", "POI ignoré :", poi.name || "Sans nom");
            markPOITriggered(poi.id);
            continue;
          }
          newPOI = poi;
          break;
        }
        logger.debug("tick", "Nouveau POI :", newPOI?.name ?? "aucun");

        if (!newPOI) {
          setActiveStatus("no-poi");
          return;
        }

        isSpeakingRef.current = !isMutedRef.current;
        setActiveStatus("generating");
        didStartSpeaking = true;
        setCurrentPOIName(newPOI.name);

        logger.debug("tick", "Gemini...");
        const { message, toolsUsed } = await generateRoadMessage({
          poiName: newPOI.name,
          coords: { lat: newPOI.lat, lng: newPOI.lng },
          poiTags: newPOI.tags,
        });
        logger.debug("tick", "Message :", message);

        markPOITriggered(newPOI.id);
        addHistoryEntry({ poiId: newPOI.id, poiName: newPOI.name, message, toolsUsed, timestamp: new Date() });
        setCurrentMessage(message);
        setCurrentToolsUsed(toolsUsed);
        setActiveStatus("speaking");
        if (!isMutedRef.current) await speak(message);
      } catch (error) {
        logger.error("Road Stories error:", error);
        if (!didStartSpeaking) setActiveStatus("listening");
      } finally {
        isTickRunning.current = false;
        if (didStartSpeaking) {
          isSpeakingRef.current = false;
          setActiveStatus("listening");
          setCurrentPOIName(null);
          if (!isMutedRef.current) {
            setCurrentMessage(null);
            setCurrentToolsUsed([]);
          }
        }
      }
    };

    void tick();
    const intervalId = setInterval(tick, settings.pollIntervalMs);

    return () => {
      clearInterval(intervalId);
      stop();
      setCurrentMessage(null);
      setCurrentToolsUsed([]);
      wakeLock?.release().catch(() => {});
    };
  }, [addHistoryEntry, hasTriggeredPOI, isActive, markPOITriggered, settings]);

  return { isActive, setIsActive, status, currentPOIName, currentMessage, currentToolsUsed, isMuted, setIsMuted, history, deleteHistoryEntry };
}
