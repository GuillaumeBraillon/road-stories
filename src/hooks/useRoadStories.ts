/**
 * Hook useRoadStories
 *
 * Orchestrateur principal de la logique métier Road Stories:
 * - Activation/désactivation du mode
 * - Surveillance GPS, requêtes Overpass, filtrage POI
 * - Génération de message IA (Gemini), synthèse vocale
 * - Gestion du statut, historique, mute, etc.
 * Retourne tous les états et callbacks nécessaires à l’UI.
 */
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
  // --- État principal de l'orchestrateur ---

  /**
   * Mode ON/OFF de l'application (contrôle global)
   */
  const [isActive, setIsActive] = useState(false);

  /**
   * Statut métier courant (hors idle) : listening, searching, generating, speaking, no-poi
   */
  const [activeStatus, setActiveStatus] = useState<Exclude<AppStatus, "idle">>("listening");

  /**
   * Nom du POI en cours de traitement (affiché dans l'UI)
   */
  const [currentPOIName, setCurrentPOIName] = useState<string | null>(null);

  /**
   * Message généré par l'IA pour le POI courant
   */
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);

  /**
   * Liste des outils IA utilisés pour générer le message (Gemini, Wikipedia, etc)
   */
  const [currentToolsUsed, setCurrentToolsUsed] = useState<string[]>([]);

  /**
   * Mode muet (empêche la synthèse vocale)
   */
  const [isMuted, setIsMuted] = useState(false);

  /**
   * Historique des POI déclenchés et callbacks associés
   */
  const { history, addHistoryEntry, deleteHistoryEntry, hasTriggeredPOI, markPOITriggered } = usePoiHistory();

  /**
   * Statut global calculé (idle si OFF, sinon status métier)
   */
  const status: AppStatus = isActive ? activeStatus : "idle";

  /**
   * Coordonnées GPS courantes (null si non dispo)
   */
  const { coords } = useGeolocation();

  // --- Références persistantes pour éviter les problèmes de closure dans les effets ---

  /**
   * Indique si la synthèse vocale est en cours (évite les interruptions)
   */
  const isSpeakingRef = useRef(false);
  /**
   * Indique si un tick métier est en cours (évite les boucles concurrentes)
   */
  const isTickRunning = useRef(false);
  /**
   * Dernières coordonnées GPS connues
   */
  const coordsRef = useRef<Coords | null>(null);
  /**
   * Thèmes actifs courants (pour détection de changement)
   */
  const themesRef = useRef<Theme[]>(themes);
  /**
   * Cache Overpass local (évite les requêtes réseau inutiles)
   */
  const overpassCache = useRef<{ coords: Coords; themesKey: string; pois: POI[] } | null>(null);
  /**
   * Mode muet courant (pour accès dans les callbacks)
   */
  const isMutedRef = useRef(false);
  /**
   * Réglages courants (pour accès dans les callbacks)
   */
  const settingsRef = useRef(settings);

  // --- Synchronisation des références persistantes ---

  // Met à jour la référence de coordonnées à chaque changement
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  // Met à jour la référence de thèmes à chaque changement
  useEffect(() => {
    themesRef.current = themes;
  }, [themes]);

  // Met à jour la référence muet à chaque changement
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted) stop(); // coupe la voix si mute activé
  }, [isMuted]);

  // Met à jour la référence de réglages à chaque changement et invalide le cache
  useEffect(() => {
    settingsRef.current = settings;
    overpassCache.current = null;
  }, [settings]);

  // --- Effet principal : boucle métier tant que l'app est active ---
  useEffect(() => {
    if (!isActive) return;

    // Wake Lock : empêche la mise en veille de l'écran pendant la conduite
    let wakeLock: WakeLockSentinel | null = null;
    navigator.wakeLock
      ?.request("screen")
      .then((wl) => {
        wakeLock = wl;
      })
      .catch(() => {});

    /**
     * Tick métier :
     * - Vérifie la position, l'état de lecture, le cache
     * - Déclenche une requête Overpass si besoin (mouvement ou changement de thèmes)
     * - Filtre les POI (anti-doublon, exclusion, contexte)
     * - Génère le message IA (Gemini)
     * - Lance la synthèse vocale
     * - Met à jour l'historique et l'état
     */
    const tick = async () => {
      if (isTickRunning.current) return;
      isTickRunning.current = true;
      let didStartSpeaking = false;

      try {
        // 1. Vérification de la position et de l'état de lecture
        logger.debug("tick", "coords:", coordsRef.current, "speaking:", isSpeakingRef.current);
        if (!coordsRef.current || isSpeakingRef.current) return;

        // 2. Gestion du cache Overpass (évite les requêtes inutiles)
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

        // 3. Filtrage métier (anti-doublon, exclusion, contexte)
        let newPOI: POI | undefined;
        for (const poi of pois) {
          if (hasTriggeredPOI(poi.id)) continue; // déjà traité
          if (shouldSkipPOI(poi.tags)) {
            logger.debug("tick", "POI ignoré :", poi.name || "Sans nom");
            markPOITriggered(poi.id);
            continue;
          }
          newPOI = poi;
          break;
        }
        logger.debug("tick", "Nouveau POI :", newPOI?.name ?? "aucun");

        // 4. Aucun POI pertinent trouvé
        if (!newPOI) {
          setActiveStatus("no-poi");
          return;
        }

        // 5. Génération du message IA et lecture vocale
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

        // 6. Historisation et affichage
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

    // Premier tick immédiat, puis intervalle régulier
    void tick();
    const intervalId = setInterval(tick, settings.pollIntervalMs);

    // Nettoyage à la désactivation ou au démontage
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
