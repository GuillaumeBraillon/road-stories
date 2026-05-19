import { useState, useEffect, useRef } from "react";
import type { AppStatus, Coords, POI, Theme } from "../types";
import { useGeolocation } from "./useGeolocation";
import { getNearbyPOIs } from "../services/overpass";
import { calculateDistance } from "../services/geolocation";
import { getWikipediaSummary } from "../services/wikipedia";
import { generateRoadMessage } from "../services/gemini";
import { speak, stop } from "../services/tts";
import { logger } from "../services/logger";

const POLL_INTERVAL_MS = 30_000;
const DETECTION_RADIUS_M = 500;
const OVERPASS_MOVE_THRESHOLD_M = 100;

export function useRoadStories(themes: Theme[]): {
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  status: AppStatus;
  currentPOIName: string | null;
} {
  const [isActive, setIsActive] = useState(false);
  const [activeStatus, setActiveStatus] = useState<Exclude<AppStatus, "idle">>("listening");
  const [currentPOIName, setCurrentPOIName] = useState<string | null>(null);

  // "idle" est dérivé de isActive — les autres états sont pilotés par setActiveStatus dans le tick
  const status: AppStatus = isActive ? activeStatus : "idle";

  const { coords } = useGeolocation();

  // Refs pour éviter les stale closures dans l'interval
  const isSpeakingRef = useRef(false);
  const isTickRunning = useRef(false);
  const coordsRef = useRef<Coords | null>(null);
  const themesRef = useRef<Theme[]>(themes);
  const triggeredPOIs = useRef(new Set<string>());
  const overpassCache = useRef<{ coords: Coords; themesKey: string; pois: POI[] } | null>(null);

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
        const hasMoved = !cache || calculateDistance(currentCoords, cache.coords) > OVERPASS_MOVE_THRESHOLD_M;
        const themesChanged = !cache || cache.themesKey !== themesKey;

        let pois: POI[];
        if (hasMoved || themesChanged) {
          logger.debug("tick", "Interrogation Overpass...");
          setActiveStatus("searching");
          pois = await getNearbyPOIs(currentCoords, themesRef.current, DETECTION_RADIUS_M);
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

        const newPOI = pois.find((poi) => !triggeredPOIs.current.has(poi.id));
        logger.debug("tick", "Nouveau POI :", newPOI?.name ?? "aucun");

        if (!newPOI) {
          setActiveStatus("no-poi");
          return;
        }

        const enabledThemes = themesRef.current.filter((t) => t.enabled).map((t) => t.label);

        // Wikipedia — résolu avant de déclencher l'état "generating" pour éviter un flash d'UI inutile
        // Pas de recherche Wikipedia si le nom est une inscription gravée (le titre serait le texte latin)
        const isInscriptionName = !newPOI.tags["wikipedia"] && newPOI.tags["inscription"] === newPOI.name;
        setActiveStatus("wikipedia");
        logger.debug("tick", "Wikipedia...");
        const wikiTag = newPOI.tags["wikipedia"];
        const wikiTitle = wikiTag ? wikiTag.replace(/^\w{2}:/, "") : newPOI.name;
        const wikipediaSummary = isInscriptionName ? null : await getWikipediaSummary(wikiTitle);

        // Panneau indicateur sans fiche Wikipedia : contexte insuffisant pour un message fiable
        if (wikipediaSummary === null && newPOI.tags["information"] === "guidepost") {
          logger.debug("tick", "POI ignoré (guidepost sans Wikipedia) :", newPOI.name);
          triggeredPOIs.current.add(newPOI.id);
          return;
        }

        // À partir d'ici on génère et lit un message — verrouiller le mutex
        // Le POI n'est marqué comme traité qu'après la génération, pour permettre un retry si Gemini échoue.
        isSpeakingRef.current = true;
        setActiveStatus("generating");
        didStartSpeaking = true;
        setCurrentPOIName(newPOI.name);

        logger.debug("tick", "Gemini...");
        const message = await generateRoadMessage({
          poiName: newPOI.name,
          coords: { lat: newPOI.lat, lng: newPOI.lng },
          poiTags: newPOI.tags,
          wikipediaSummary,
          enabledThemes,
        });
        logger.debug("tick", "Message :", message);

        triggeredPOIs.current.add(newPOI.id);
        setActiveStatus("speaking");
        await speak(message);
      } catch (error) {
        logger.error("Road Stories error:", error);
      } finally {
        isTickRunning.current = false;
        if (didStartSpeaking) {
          isSpeakingRef.current = false;
          setActiveStatus("listening");
          setCurrentPOIName(null);
        }
      }
    };

    // Premier tick immédiat, puis toutes les 30 secondes
    void tick();
    const intervalId = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      stop();
      wakeLock?.release().catch(() => {});
    };
  }, [isActive]);

  return { isActive, setIsActive, status, currentPOIName };
}
