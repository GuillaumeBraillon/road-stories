/**
 * Hook useRoadStories
 *
 * Orchestrateur principal de la logique métier de l'application Road Stories.
 * Responsabilités :
 * - Gestion du cycle de vie du mode conduite (ON/OFF) via un intervalle régulier (polling tick).
 * - Interrogation du proxy Overpass Edge en fonction de la position GPS actuelle et des thèmes actifs.
 * - Sélection, filtrage et déduplication du POI le plus pertinent à proximité.
 * - Requête à l'API Gemini Edge pour générer un récit audio culturel enrichi d'outils.
 * - Gestion de la synthèse vocale (TTS) asynchrone avec coupure réactive au Mute et au OFF.
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

/**
 * Hook personnalisé orchestrant la détection des POI, l'appel à l'IA et la restitution audio.
 *
 * @param themes Liste des thèmes culturels configurés dans l'application.
 * @param settings Paramètres généraux de l'application (intervalles, rayons, etc.).
 * @returns Un objet contenant les états réactifs de l'UI et les fonctions de contrôle.
 */
export function useRoadStories(
  themes: Theme[],
  settings: AppSettings
): {
  /** Mode conduite activé (ON) ou désactivé (OFF) */
  isActive: boolean;
  /** Callback pour basculer le mode conduite */
  setIsActive: (value: boolean) => void;
  /** Statut interne de la machine à états de l'orchestrateur */
  status: AppStatus;
  /** Nom du point d'intérêt actuellement traité */
  currentPOIName: string | null;
  /** Contenu textuel de l'anecdote culturelle générée par Gemini */
  currentMessage: string | null;
  /** Liste des outils (Wikipedia, Google Places) invoqués par l'agent */
  currentToolsUsed: string[];
  /** Etat du theme */
  currentThemeLabel: string | undefined;
  /** État du mode silencieux */
  isMuted: boolean;
  /** Callback pour basculer le mode silencieux */
  setIsMuted: (value: boolean) => void;
  /** Historique complet des POI déclenchés au cours de la session */
  history: PoiHistoryEntry[];
  /** Supprime une entrée spécifique de l'historique par son index */
  deleteHistoryEntry: (index: number) => void;
} {
  // --- États Réactifs UI ---
  const [isActive, setIsActive] = useState<boolean>(false);
  const [status, setStatus] = useState<AppStatus>("listening");
  const [currentPOIName, setCurrentPOIName] = useState<string | null>(null);
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [currentToolsUsed, setCurrentToolsUsed] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentThemeLabel, setCurrentThemeLabel] = useState<string | undefined>(undefined);

  // --- Gestion de l'Historique ---
  const { history, addHistoryEntry, deleteHistoryEntry, hasTriggeredPOI, markPOITriggered } = usePoiHistory();

  // --- Capteur de Géolocalisation Réactif ---
  const { coords, error: geoError } = useGeolocation();

  // --- Verrous Technologiques (Refs de synchronisation) ---
  const isTickRunning = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(false);
  const isMutedTransitionRef = useRef<boolean>(false);
  const lastTriggeredCoordsRef = useRef<Coords | null>(null);
  const lastPoiRef = useRef<{ id: string; time: number } | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const coordsRef = useRef<Coords | null>(null);

  // --- Sauvegarde des configurations pour immuniser le useEffect principal contre les re-renders ---
  const settingsRef = useRef<AppSettings>(settings);
  const themesRef = useRef<Theme[]>(themes);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    themesRef.current = themes;
  }, [themes]);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  // --- Synchronisation du bouton MUTE avec action immédiate sur le récit en cours ---
  useEffect(() => {
    isMutedRef.current = isMuted;

    if (isMuted && isSpeakingRef.current) {
      logger.debug("useRoadStories", "🔕 [BOUTON MUTE] Interruption sonore immédiate du récit en cours de lecture.");
      isMutedTransitionRef.current = true;
      stop();
    } else {
      logger.debug("useRoadStories", `État Mute synchronisé : ${isMuted ? "🔕 ACTIF" : "🔊 INACTIF"}`);
    }
  }, [isMuted]);

  // --- Effet Principal : Boucle d'Exécution Temporisée (Polling Core) ---
  useEffect(() => {
    if (!isActive) {
      logger.debug("useRoadStories", "Mode inactif détecté (OFF). Boucle de polling non instanciée.");
      return;
    }

    /**
     * Machine à états locale : encapsulée ici pour éviter les warnings de dépendance ESLint.
     */
    const setActiveStatusLocal = (newStatus: AppStatus) => {
      setStatus((currentStatus) => {
        if (currentStatus === newStatus) return currentStatus;
        return newStatus;
      });
      // Log en dehors du updater — exécuté une seule fois
      logger.debug("useRoadStories", `Changement de statut machine : ➡️ ${newStatus}`);
    };

    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      if ("wakeLock" in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request("screen");
          logger.debug("useRoadStories", "🔒 Screen Wake Lock activé avec succès.");
        } catch (err) {
          logger.warn("useRoadStories", "Échec de l'activation du Wake Lock:", err);
        }
      }
    };
    void requestWakeLock();

    /**
     * Cœur d'exécution de la boucle d'analyse géographique.
     */
    const tick = async () => {
      logger.debug("useRoadStories", `[TICK START] Vérification d'état - isTickRunning: ${isTickRunning.current}, isSpeaking: ${isSpeakingRef.current}`);
      const requestId = crypto.randomUUID();
      logger.debug("useRoadStories", `[${requestId}] TICK START`);

      if (isTickRunning.current || isSpeakingRef.current) {
        logger.debug("useRoadStories", "[TICK END] Un traitement réseau ou audio est déjà en cours d'exécution.");
        return;
      }

      const currentCoords = coordsRef.current;

      if (!currentCoords) {
        logger.debug("useRoadStories", "[TICK END] En attente de coordonnées GPS valides de la part du capteur.");
        isTickRunning.current = false;
        return;
      }

      const now = Date.now();
      if (now - lastTickTimeRef.current < 2000) {
        logger.debug("useRoadStories", `[TICK END] Debounce actif (2s) - tick ignoré`);
        return;
      }

      isTickRunning.current = true;

      try {
        const currentSettings = settingsRef.current;
        const currentThemes = themesRef.current;

        const minDistanceBetweenStories = currentSettings.overpassMoveThresholdM;
        const searchRadius = currentSettings.detectionRadiusM;

        logger.debug("useRoadStories", `[CONFIGURATION] Seuil de déplacement requis : ${minDistanceBetweenStories}m | Rayon de recherche : ${searchRadius}m`);

        if (lastTriggeredCoordsRef.current) {
          const distanceSinceLastStory = calculateDistance(currentCoords, lastTriggeredCoordsRef.current);
          logger.debug(
            "useRoadStories",
            `[CONFIGURATION] Distance depuis le dernier POI : ${distanceSinceLastStory.toFixed(1)}m (Seuil requis : ${minDistanceBetweenStories}m)`
          );

          if (distanceSinceLastStory < minDistanceBetweenStories) {
            logger.debug("useRoadStories", "[TICK END] Rayon de déplacement insuffisant par rapport au seuil.");
            isTickRunning.current = false;
            return;
          }
        }

        setActiveStatusLocal("searching");

        logger.debug("useRoadStories", `[CALL OVERPASS] lat: ${currentCoords.lat}, lng: ${currentCoords.lng} (Rayon: ${searchRadius}m)`);
        const pois = await getNearbyPOIs(currentCoords, currentThemes, searchRadius);

        logger.debug(
          "useRoadStories",
          `${pois.length} POI(s) :`,
          pois.map((p) => p.name)
        );

        if (pois.length === 0) {
          logger.debug("useRoadStories", "😴 Aucun point d'intérêt trouvé dans le périmètre actuel.");
          setActiveStatusLocal("listening");
          isTickRunning.current = false;
          return;
        }

        // --- Filtrage centralisé et traçabilité claire ---
        const eligiblePOIs: POI[] = [];
        logger.debug("useRoadStories", "Début du processus de filtrage des POI extraits...");
        for (const poi of pois) {
          if (hasTriggeredPOI(poi.id)) {
            logger.debug("useRoadStories", `❌ [Déjà entendu au cours de la session] ➡️ "${poi.name}"`);
            continue;
          }
          if (shouldSkipPOI(poi.tags, poi.name)) continue;

          eligiblePOIs.push(poi);
        }

        logger.debug("useRoadStories", `${eligiblePOIs.length} POI(s) éligible(s) sur ${pois.length}.`);

        if (eligiblePOIs.length === 0) {
          logger.debug("useRoadStories", "⏭️ Fin du tick : Aucun POI de la zone n'est valide ou disponible.");
          setActiveStatusLocal("listening");
          isTickRunning.current = false;
          return;
        }

        // Selection du plus proche
        const candidatePOIs = eligiblePOIs
          .map((poi) => ({
            poi,
            distance: calculateDistance(currentCoords, { lat: poi.lat, lng: poi.lng }),
          }))
          .sort((a, b) => a.distance - b.distance);

        const target = candidatePOIs[0];
        const newPOI = target.poi;

        const now = Date.now();

        if (lastPoiRef.current?.id === newPOI.id && now - lastPoiRef.current.time < 15000) {
          logger.debug("useRoadStories", "⏭️ POI déjà traité récemment (fenêtre anti-doublon 15s), skip tick.");
          isTickRunning.current = false;
          return;
        }

        lastPoiRef.current = {
          id: newPOI.id,
          time: now,
        };

        logger.debug("useRoadStories", `🎯 POI Cible sélectionné : "${newPOI.name}" (${target.distance.toFixed(1)}m).`);
        setCurrentThemeLabel(newPOI.themeLabel);

        // Appel Génération IA
        const { message, refinedTitle, toolsUsed } = await generateRoadMessage({
          poiName: newPOI.name,
          coords: { lat: newPOI.lat, lng: newPOI.lng },
          poiTags: newPOI.tags,
        });

        const cleanTitle = refinedTitle && refinedTitle.trim() ? refinedTitle.trim() : newPOI.name;

        // Mutation historique et refs
        markPOITriggered(newPOI.id);
        addHistoryEntry({
          poiId: newPOI.id,
          poiName: cleanTitle,
          message,
          toolsUsed,
          timestamp: new Date(),
          themeLabel: newPOI.themeLabel,
        });

        lastTriggeredCoordsRef.current = currentCoords;
        setCurrentMessage(message);
        setCurrentPOIName(cleanTitle);
        setCurrentToolsUsed(toolsUsed);
        lastTickTimeRef.current = Date.now();
        logger.debug("useRoadStories", `[${requestId}] Tick completed successfully`);

        // Sortie audio
        if (!isMutedRef.current) {
          isSpeakingRef.current = true;
          setActiveStatusLocal("speaking");
          await speak(message);
          isSpeakingRef.current = false;
        } else {
          logger.debug("useRoadStories", "🔕 Mode Mute actif à la fin de la génération : Affichage texte pur sans voix.");
        }

        if (isMutedTransitionRef.current) {
          logger.debug("useRoadStories", "ℹ️ Récit interrompu par l'utilisateur via le bouton Mute. Préservation des textes à l'écran.");
          isMutedTransitionRef.current = false;
          setActiveStatusLocal("listening");
        } else {
          logger.debug("useRoadStories", "🏁 Fin nominale du cycle de traitement. Remise à zéro de l'écran de détection.");
          setActiveStatusLocal("listening");
        }
      } catch (error) {
        logger.error("useRoadStories", "💥 Erreur critique lors de l'exécution du tick:", error);

        if (isMutedTransitionRef.current) {
          isSpeakingRef.current = false;
          isMutedTransitionRef.current = false;
          setActiveStatusLocal("listening");
        } else if (!isSpeakingRef.current) {
          setActiveStatusLocal("listening");
          setCurrentPOIName(null);
        }
      } finally {
        isTickRunning.current = false;
      }
    };

    void tick();
    const intervalId = setInterval(tick, settingsRef.current.pollIntervalMs);

    // Hard-reset complet sur démontage/passage à OFF
    return () => {
      logger.debug("useRoadStories", "📴 [BOUTON OFF] Demande d'extinction complète et hard-reset de la session.");
      clearInterval(intervalId);
      stop();

      isSpeakingRef.current = false;
      isTickRunning.current = false;
      isMutedTransitionRef.current = false;

      setActiveStatusLocal("listening");
      setCurrentMessage(null);
      setCurrentToolsUsed([]);
      setCurrentPOIName(null);
      setCurrentThemeLabel(undefined);

      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
    };
  }, [isActive, addHistoryEntry, hasTriggeredPOI, markPOITriggered]);

  // Log des erreurs de géolocalisation
  useEffect(() => {
    if (isActive && geoError) {
      logger.error("useRoadStories", "Erreur émise par le capteur GPS réactif :", geoError);
    }
  }, [geoError, isActive]);

  return {
    isActive,
    setIsActive,
    status,
    currentPOIName,
    currentMessage,
    currentToolsUsed,
    currentThemeLabel,
    isMuted,
    setIsMuted,
    history,
    deleteHistoryEntry,
  };
}
