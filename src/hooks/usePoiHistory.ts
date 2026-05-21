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
  // 1. On utilise l'initialisation paresseuse (lazy initialization) native de useState.
  // C'est propre, standard, et exécuté une seule fois au montage sans utiliser de ref.
  const [history, setHistory] = useState<PoiHistoryEntry[]>(() => loadHistory());

  // 2. On initialise le Set directement avec le state "history" du premier rendu.
  // Plus besoin de lire une ref pendant le rendu !
  const triggeredPOIs = useRef(new Set<string>(history.map((entry) => entry.poiId).filter((id): id is string => id !== "")));

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const hasTriggeredPOI = useCallback((poiId: string) => triggeredPOIs.current.has(poiId), []);

  const markPOITriggered = useCallback((poiId: string) => {
    triggeredPOIs.current.add(poiId);
  }, []);

  // 3. Ajout de [setHistory] pour satisfaire les exigences du React Compiler
  const addHistoryEntry = useCallback(
    (entry: PoiHistoryEntry) => {
      setHistory((prev) => [entry, ...prev]);
    },
    [setHistory]
  );

  // 4. Ajout de [setHistory] ici également
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
