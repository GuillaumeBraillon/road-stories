import { useState, useEffect, useRef } from "react";
import type { AppSettings, AppStatus, Coords, POI, PoiHistoryEntry, Theme } from "../types";
import { useGeolocation } from "./useGeolocation";
import { getNearbyPOIs } from "../services/overpass";
import { calculateDistance } from "../services/geolocation";
import { getWikipediaSummary } from "../services/wikipedia";
import { generateRoadMessage } from "../services/gemini";
import { speak, stop } from "../services/tts";
import { logger } from "../services/logger";
import { loadHistory, saveHistory } from "../services/storage";

export function useRoadStories(
  themes: Theme[],
  settings: AppSettings
): {
  isActive: boolean;
  setIsActive: (value: boolean) => void;
  status: AppStatus;
  currentPOIName: string | null;
  currentMessage: string | null;
  currentMessageSource: "gemini" | "wiki+gemini" | null;
  isMuted: boolean;
  setIsMuted: (value: boolean) => void;
  history: PoiHistoryEntry[];
  deleteHistoryEntry: (index: number) => void;
} {
  const [isActive, setIsActive] = useState(false);
  const [activeStatus, setActiveStatus] = useState<Exclude<AppStatus, "idle">>("listening");
  const [currentPOIName, setCurrentPOIName] = useState<string | null>(null);
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [currentMessageSource, setCurrentMessageSource] = useState<"gemini" | "wiki+gemini" | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [history, setHistory] = useState<PoiHistoryEntry[]>(loadHistory);

  // "idle" est dérivé de isActive — les autres états sont pilotés par setActiveStatus dans le tick
  const status: AppStatus = isActive ? activeStatus : "idle";

  const { coords } = useGeolocation();

  // Refs pour éviter les stale closures dans l'interval
  const isSpeakingRef = useRef(false);
  const isTickRunning = useRef(false);
  const coordsRef = useRef<Coords | null>(null);
  const themesRef = useRef<Theme[]>(themes);
  const triggeredPOIs = useRef(
    new Set<string>(
      loadHistory()
        .map((e) => e.poiId)
        .filter((id): id is string => id !== "")
    )
  );
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
    overpassCache.current = null; // force re-fetch si rayon ou seuil changé
  }, [settings]);
  useEffect(() => {
    saveHistory(history);
  }, [history]);

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
        const hasMoved = !cache || calculateDistance(currentCoords, cache.coords) > settingsRef.current.overpassMoveThresholdM;
        const themesChanged = !cache || cache.themesKey !== themesKey;

        let pois: POI[];
        if (hasMoved || themesChanged) {
          logger.debug("tick", "Interrogation Overpass...");
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

        // Tags qui apportent du contenu réel au-delà de la simple classification OSM.
        // Pré-filtrage synchrone : on saute immédiatement les POIs sans contenu exploitable
        // plutôt qu'attendre le prochain tick de 30 secondes.
        const ENRICHING_TAGS = ["description", "inscription", "heritage", "castle_type", "site_type", "denomination", "religion", "ele", "height", "wikidata"];
        let newPOI: POI | undefined;
        for (const poi of pois) {
          if (triggeredPOIs.current.has(poi.id)) continue;
          if (!ENRICHING_TAGS.some((key) => poi.tags[key])) {
            logger.debug("tick", "POI ignoré (contexte insuffisant) :", poi.name);
            triggeredPOIs.current.add(poi.id);
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

        // À partir d'ici on génère et lit un message.
        // En mode muet, le mutex n'est pas verrouillé — le tick suivant peut s'enchaîner normalement.
        // Le POI n'est marqué comme traité qu'après la génération, pour permettre un retry si Gemini échoue.
        isSpeakingRef.current = !isMutedRef.current;
        setActiveStatus("generating");
        didStartSpeaking = true;
        setCurrentPOIName(newPOI.name);

        logger.debug("tick", "Gemini...");
        const message = await generateRoadMessage({
          poiName: newPOI.name,
          coords: { lat: newPOI.lat, lng: newPOI.lng },
          poiTags: newPOI.tags,
          wikipediaSummary,
        });
        logger.debug("tick", "Message :", message);

        triggeredPOIs.current.add(newPOI.id);
        setHistory((prev) => [
          { poiId: newPOI.id, poiName: newPOI.name, message, source: wikipediaSummary ? "wiki+gemini" : "gemini", timestamp: new Date() },
          ...prev,
        ]);
        setCurrentMessage(message);
        setCurrentMessageSource(wikipediaSummary ? "wiki+gemini" : "gemini");
        setActiveStatus("speaking");
        if (!isMutedRef.current) {
          await speak(message);
        }
      } catch (error) {
        logger.error("Road Stories error:", error);
        if (!didStartSpeaking) setActiveStatus("listening");
      } finally {
        isTickRunning.current = false;
        if (didStartSpeaking) {
          isSpeakingRef.current = false;
          setActiveStatus("listening");
          setCurrentPOIName(null);
          // En mode muet : conserver le message affiché jusqu'au prochain POI
          if (!isMutedRef.current) {
            setCurrentMessage(null);
            setCurrentMessageSource(null);
          }
        }
      }
    };

    // Premier tick immédiat, puis intervalle configurable
    void tick();
    const intervalId = setInterval(tick, settings.pollIntervalMs);

    return () => {
      clearInterval(intervalId);
      stop();
      setCurrentMessage(null);
      setCurrentMessageSource(null);
      wakeLock?.release().catch(() => {});
    };
  }, [isActive, settings.pollIntervalMs]);

  function deleteHistoryEntry(index: number) {
    setHistory((prev) => {
      const entry = prev[index];
      if (entry?.poiId) triggeredPOIs.current.delete(entry.poiId);
      return prev.filter((_, i) => i !== index);
    });
  }

  return { isActive, setIsActive, status, currentPOIName, currentMessage, currentMessageSource, isMuted, setIsMuted, history, deleteHistoryEntry };
}
