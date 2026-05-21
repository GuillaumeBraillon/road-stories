import { useState, useEffect, useRef } from "react";
import type { AppSettings, AppStatus, Coords, POI, PoiHistoryEntry, Theme } from "../types";
import { useGeolocation } from "./useGeolocation";
import { getNearbyPOIs } from "../services/overpass";
import { calculateDistance } from "../services/geolocation";
import { generateRoadMessage } from "../services/gemini";
import { speak, stop } from "../services/tts";
import { logger } from "../services/logger";
import { usePoiHistory } from "./usePoiHistory";

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

  // "idle" est dérivé de isActive — les autres états sont pilotés par setActiveStatus dans le tick
  const status: AppStatus = isActive ? activeStatus : "idle";

  const { coords } = useGeolocation();

  // Refs pour éviter les stale closures dans l'interval
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
    overpassCache.current = null; // force re-fetch si rayon ou seuil changé
  }, [settings]);
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
        // Tags qui apportent du contenu réel au-delà de la simple classification OSM.
        // Tags textuels OSM d'origine
        const ENRICHING_TAGS = ["description", "inscription", "heritage", "castle_type", "site_type", "denomination", "religion", "ele", "height", "wikidata"];

        // Catégories prioritaires pour lesquelles Gemini peut utiliser ses outils (Wikipedia / Google Places)
        const TOOL_SUPPORTED_CATEGORIES = new Set(["museum", "theatre", "artwork", "castle", "monument", "attraction", "arts_centre"]);

        let newPOI: POI | undefined;

        for (const poi of pois) {
          if (hasTriggeredPOI(poi.id)) continue;

          // 1. GARDE-FOU ANTI-POLLUTION (Exclusion des panneaux administratifs et règles de parcs)
          const isGuidepost = poi.tags["information"] === "guidepost";
          const isRuleBoard = poi.tags["information"] === "board" && poi.tags["board_type"] === "rules";
          const inscriptionText = (poi.tags["inscription"] || "").toLowerCase();
          const hasRuleKeywords =
            inscriptionText.includes("destinée aux enfants") || inscriptionText.includes("interdit aux") || inscriptionText.includes("règlement");

          if (isGuidepost || isRuleBoard || hasRuleKeywords) {
            logger.debug("tick", "POI ignoré (panneau administratif) :", poi.name || "Sans nom");
            markPOITriggered(poi.id);
            continue;
          }

          // 2. VÉRIFICATION DU CONTEXTE (OSM ou Outils Gemini)
          const hasEnrichingTag = ENRICHING_TAGS.some((key) => poi.tags[key]);

          // Est-ce que le POI appartient à une catégorie gérée par nos outils ?
          const isEligibleForTools =
            TOOL_SUPPORTED_CATEGORIES.has(poi.tags["tourism"] || "") ||
            TOOL_SUPPORTED_CATEGORIES.has(poi.tags["amenity"] || "") ||
            TOOL_SUPPORTED_CATEGORIES.has(poi.tags["historic"] || "");

          // On valide le POI s'il a des tags riches OSM OU s'il est éligible à une recherche Wikipedia/Places
          if (!hasEnrichingTag && !isEligibleForTools) {
            logger.debug("tick", "POI ignoré (contexte insuffisant et non éligible aux outils) :", poi.name);
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

        // À partir d'ici on génère et lit un message.
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
            setCurrentToolsUsed([]);
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
      setCurrentToolsUsed([]);
      wakeLock?.release().catch(() => {});
    };
  }, [addHistoryEntry, hasTriggeredPOI, isActive, markPOITriggered, settings]);

  return { isActive, setIsActive, status, currentPOIName, currentMessage, currentToolsUsed, isMuted, setIsMuted, history, deleteHistoryEntry };
}
