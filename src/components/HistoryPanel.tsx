/**
 * Composant HistoryPanel
 *
 * Affiche le panneau latéral de l’historique des POI déclenchés.
 * Permet de réécouter un message ou de supprimer une entrée.
 *
 * Props :
 * - isOpen : booléen, ouverture/fermeture du panneau
 * - onClose : callback fermeture
 * - history : tableau d’entrées d’historique (PoiHistoryEntry[])
 * - onDelete : suppression d’une entrée
 */
import { useState } from "react";
import type { PoiHistoryEntry } from "../types";
import { BottomSheet } from "./BottomSheet";
import { ToolBadges } from "./ToolBadges";
import { speak, stop } from "../services/tts";
import { TppmThemes } from "./TppmThemes";

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  history: PoiHistoryEntry[];
  onDelete: (index: number) => void;
}

export function HistoryPanel({ isOpen, onClose, history, onDelete }: HistoryPanelProps) {
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  async function handleReplay(message: string, index: number) {
    if (playingIndex === index) {
      stop();
      setPlayingIndex(null);
      return;
    }
    if (playingIndex !== null) stop();
    setPlayingIndex(index);
    await speak(message);
    setPlayingIndex(null);
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Historique">
      {history.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">Aucun lieu trouvé pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {history.map((entry, index) => (
            <div key={index} className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{entry.poiName}</p>
                <p className="text-gray-600 text-xs">
                  {entry.timestamp.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <p className="text-white text-sm leading-relaxed">{entry.message}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ToolBadges tools={entry.toolsUsed} />
                  <TppmThemes label={entry.themeLabel} />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      void handleReplay(entry.message, index);
                    }}
                    className="text-lg p-1 rounded-full hover:bg-gray-700 transition-colors"
                    aria-label={playingIndex === index ? "Arrêter" : "Réécouter"}
                  >
                    {playingIndex === index ? "⏹️" : "▶️"}
                  </button>
                  <button
                    onClick={() => onDelete(index)}
                    className="text-sm p-1 rounded-full hover:bg-gray-700 text-gray-500 hover:text-red-400 transition-colors"
                    aria-label="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
