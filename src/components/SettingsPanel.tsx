/**
 * Composant SettingsPanel
 *
 * Affiche le panneau latéral des réglages utilisateur (intervalle, rayon, etc).
 *
 * Props :
 * - isOpen : booléen, ouverture/fermeture du panneau
 * - onClose : callback fermeture
 * - settings : objet AppSettings
 * - onChange : callback de modification des réglages
 */
import type { AppSettings } from "../types";
import { BottomSheet } from "./BottomSheet";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

export function SettingsPanel({ isOpen, onClose, settings, onChange }: SettingsPanelProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Réglages">
      <div className="flex flex-col gap-6">
        <SettingSelect
          label="Intervalle de scan"
          description="Fréquence à laquelle l'app cherche des POIs à proximité."
          value={settings.pollIntervalMs}
          onChange={(v) => onChange({ ...settings, pollIntervalMs: v })}
          options={[
            { value: 10_000, label: "10 secondes" },
            { value: 20_000, label: "20 secondes" },
            { value: 30_000, label: "30 secondes (défaut)" },
            { value: 45_000, label: "45 secondes" },
            { value: 60_000, label: "60 secondes" },
            { value: 90_000, label: "90 secondes" },
            { value: 120_000, label: "120 secondes" },
          ]}
        />
        <SettingSelect
          label="Rayon de détection"
          description="Distance autour de votre position dans laquelle les POIs sont cherchés."
          value={settings.detectionRadiusM}
          onChange={(v) => onChange({ ...settings, detectionRadiusM: v })}
          options={[
            { value: 250, label: "250 mètres" },
            { value: 500, label: "500 mètres (défaut)" },
            { value: 1000, label: "1 kilomètre" },
            { value: 2000, label: "2 kilomètres" },
            { value: 3000, label: "3 kilomètres" },
            { value: 5000, label: "5 kilomètres" },
            { value: 10000, label: "10 kilomètres" },
          ]}
        />
        <SettingSelect
          label="Seuil de déplacement"
          description="Distance minimale à parcourir avant de relancer une recherche Overpass."
          value={settings.overpassMoveThresholdM}
          onChange={(v) => onChange({ ...settings, overpassMoveThresholdM: v })}
          options={[
            { value: 50, label: "50 mètres" },
            { value: 100, label: "100 mètres (défaut)" },
            { value: 200, label: "200 mètres" },
            { value: 500, label: "500 mètres" },
            { value: 1000, label: "1 kilomètre" },
            { value: 2000, label: "2 kilomètres" },
            { value: 5000, label: "5 kilomètres" },
            { value: 10000, label: "10 kilomètres" },
          ]}
        />
      </div>
    </BottomSheet>
  );
}

// Sous-composant interne — pas exporté
interface SettingSelectProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  options: { value: number; label: string }[];
}

function SettingSelect({ label, description, value, onChange, options }: SettingSelectProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <p className="text-xs text-gray-500">{description}</p>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-gray-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
