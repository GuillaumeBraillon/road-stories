/**
 * Hook usePoiHistory
 *
 * Gère l’historique local des POI déclenchés (ajout, suppression, vérification).
 * Fournit history, addHistoryEntry, deleteHistoryEntry, hasTriggeredPOI, markPOITriggered.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PoiHistoryEntry } from "../types";
import { loadHistory, saveHistory } from "../services/storage";

export function usePoiHistory(): {
  history: PoiHistoryEntry[];
  addHistoryEntry: (entry: PoiHistoryEntry) => void;
  deleteHistoryEntry: (index: number) => void;
  hasTriggeredPOI: (poiId: string) => boolean;
  markPOITriggered: (poiId: string) => void;
} {
  /**
   * Historique local des POI déclenchés (persisté en localStorage).
   * Initialisé une seule fois au montage (lazy init).
   */
  const [history, setHistory] = useState<PoiHistoryEntry[]>(() => loadHistory());

  /**
   * Set des POI déjà déclenchés (pour l’anti-doublon rapide).
   * Initialisé à partir de l’historique au premier rendu.
   */
  const triggeredPOIs = useRef(new Set<string>(history.map((entry) => entry.poiId).filter((id): id is string => id !== "")));

  // Sauvegarde l’historique à chaque modification
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  /**
   * Vérifie si un POI a déjà été déclenché (anti-doublon)
   */
  const hasTriggeredPOI = useCallback((poiId: string) => triggeredPOIs.current.has(poiId), []);

  /**
   * Marque un POI comme déclenché (ajout dans le Set)
   */
  const markPOITriggered = useCallback((poiId: string) => {
    triggeredPOIs.current.add(poiId);
  }, []);

  /**
   * Ajoute une entrée à l’historique (en tête)
   */
  const addHistoryEntry = useCallback(
    (entry: PoiHistoryEntry) => {
      setHistory((prev) => [entry, ...prev]);
    },
    [setHistory]
  );

  /**
   * Supprime une entrée de l’historique (et du Set anti-doublon)
   */
  const deleteHistoryEntry = useCallback(
    (index: number) => {
      setHistory((prev) => {
        const entry = prev[index];
        if (entry?.poiId) triggeredPOIs.current.delete(entry.poiId);
        return prev.filter((_, i) => i !== index);
      });
    },
    [setHistory]
  );

  return { history, addHistoryEntry, deleteHistoryEntry, hasTriggeredPOI, markPOITriggered };
}
