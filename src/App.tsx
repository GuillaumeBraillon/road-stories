import { useState, useEffect } from "react";
import type { Theme, ThemeGroup, PoiHistoryEntry, AppSettings } from "./types";
import { useRoadStories } from "./hooks/useRoadStories";
import { loadThemeGroups, saveThemeGroups, loadSettings, saveSettings } from "./services/storage";
import { speak, stop } from "./services/tts";
import { ToggleButton } from "./components/ToggleButton";
import { StatusIndicator } from "./components/StatusIndicator";
import { ThemeSelector } from "./components/ThemeSelector";
import { usePWAInstall } from "./hooks/usePWAInstall";
import { Download } from "lucide-react";

const DEFAULT_THEME_GROUPS: ThemeGroup[] = [
  {
    id: "patrimoine",
    label: "Patrimoine",
    icon: "🏰",
    subThemes: [
      {
        id: "chateaux",
        label: "Châteaux & fortifications",
        enabled: true,
        osmFilters: ['"historic"="castle"', '"historic"="fort"', '"historic"="city_gate"', '"historic"="tower"'],
      },
      {
        id: "monuments",
        label: "Monuments & mémoriaux",
        enabled: true,
        osmFilters: ['"historic"="monument"', '"historic"="boundary_stone"', '"historic"="milestone"'],
      },
      {
        id: "archeologie",
        label: "Sites archéologiques & ruines",
        enabled: true,
        osmFilters: ['"historic"="archaeological_site"', '"historic"="ruins"', '"historic"="roman_road"'],
      },
      {
        id: "patrimoine_industriel",
        label: "Patrimoine industriel",
        enabled: false,
        osmFilters: ['"historic"="industrial"', '"historic"="mine"', '"man_made"="windmill"', '"historic"="aqueduct"'],
      },
      {
        id: "geologie",
        label: "Curiosités géologiques",
        enabled: false,
        osmFilters: [
          '"geological"="volcanic_caldera_rim"',
          '"geological"="palaeontological_site"',
          '"geological"="meteor_crater"',
          '"geological"="glacial_erratic"',
        ],
      },
    ],
  },
  {
    id: "culture",
    label: "Culture & Arts",
    icon: "🎨",
    subThemes: [
      {
        id: "musees",
        label: "Musées",
        enabled: true,
        osmFilters: ['"tourism"="museum"'],
      },
      {
        id: "art",
        label: "Art & sculptures",
        enabled: false,
        osmFilters: ['"tourism"="artwork"', '"amenity"="arts_centre"', '"tourism"="gallery"'],
      },
      {
        id: "spectacles",
        label: "Théâtres & opéras",
        enabled: false,
        osmFilters: ['"amenity"="theatre"', '"amenity"="opera"'],
      },
      {
        id: "sciences",
        label: "Sciences & planétariums",
        enabled: false,
        osmFilters: ['"amenity"="planetarium"', '"tourism"="aquarium"'],
      },
    ],
  },
  {
    id: "nature",
    label: "Nature & Paysages",
    icon: "🌿",
    subThemes: [
      {
        id: "sommets",
        label: "Sommets & reliefs",
        enabled: true,
        osmFilters: ['"natural"="peak"', '"natural"="ridge"', '"natural"="cliff"'],
      },
      {
        id: "eau",
        label: "Chutes d'eau & lacs",
        enabled: true,
        osmFilters: ['"natural"="waterfall"', '"water"="lake"', '"water"="reservoir"'],
      },
      {
        id: "grottes",
        label: "Grottes & cavernes",
        enabled: true,
        osmFilters: ['"natural"="cave_entrance"'],
      },
      {
        id: "parcs_naturels",
        label: "Parcs naturels & réserves",
        enabled: true,
        osmFilters: ['"boundary"="national_park"', '"leisure"="nature_reserve"', '"boundary"="protected_area"'],
      },
      {
        id: "forets",
        label: "Forêts remarquables",
        enabled: false,
        osmFilters: ['"natural"="wood"', '"landuse"="forest"'],
      },
    ],
  },
  {
    id: "tourisme",
    label: "Tourisme & Loisirs",
    icon: "🎡",
    subThemes: [
      {
        id: "attractions",
        label: "Attractions & parcs",
        enabled: true,
        osmFilters: ['"tourism"="theme_park"', '"tourism"="zoo"', '"tourism"="attraction"'],
      },
    ],
  },
  {
    id: "religion",
    label: "Lieux de culte",
    icon: "⛪",
    subThemes: [
      {
        id: "eglises",
        label: "Églises & cathédrales",
        enabled: false,
        osmFilters: ['"amenity"="place_of_worship"', '"building"="cathedral"', '"building"="church"'],
      },
      {
        id: "abbayes",
        label: "Abbayes & monastères",
        enabled: false,
        osmFilters: ['"historic"="monastery"', '"historic"="abbey"'],
      },
    ],
  },
];

function flattenThemes(groups: ThemeGroup[]): Theme[] {
  return groups.flatMap((g) => g.subThemes);
}

function App() {
  const [themeGroups, setThemeGroups] = useState<ThemeGroup[]>(() => loadThemeGroups(DEFAULT_THEME_GROUPS));
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const { isInstallable, install } = usePWAInstall();

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveThemeGroups(themeGroups);
  }, [themeGroups]);

  const allThemes = themeGroups.flatMap((g) => g.subThemes);
  const activeThemeCount = allThemes.filter((t) => t.enabled).length;
  const totalThemeCount = allThemes.length;

  const { isActive, setIsActive, status, currentPOIName, currentMessage, currentMessageSource, isMuted, setIsMuted, history, deleteHistoryEntry } =
    useRoadStories(flattenThemes(themeGroups), settings);

  function handleThemeToggle(themeId: string) {
    setThemeGroups((prev) =>
      prev.map((group) => ({
        ...group,
        subThemes: group.subThemes.map((t) => (t.id === themeId ? { ...t, enabled: !t.enabled } : t)),
      }))
    );
  }

  function handleGroupToggle(groupId: string) {
    setThemeGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        const allEnabled = group.subThemes.every((t) => t.enabled);
        return { ...group, subThemes: group.subThemes.map((t) => ({ ...t, enabled: !allEnabled })) };
      })
    );
  }

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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center px-6 py-10 gap-8">
      <div className="w-full max-w-sm flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold tracking-tight">Road Stories</h1>
          <span className="text-xs text-gray-500">v{__APP_VERSION__}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* BOUTON PWA INSTALL */}
          {isInstallable && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors animate-in fade-in slide-in-from-top-2"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Installer</span>
            </button>
          )}
          <button onClick={() => setIsSettingsPanelOpen(true)} className="text-2xl p-2 rounded-full hover:bg-gray-800 transition-colors" aria-label="Réglages">
            ⚙️
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-2xl p-2 rounded-full hover:bg-gray-800 transition-colors"
            aria-label={isMuted ? "Activer le son" : "Couper le son"}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>

      <StatusIndicator status={status} currentPOIName={currentPOIName} detectionRadiusM={settings.detectionRadiusM} />

      {currentMessage && (
        <div className="w-full max-w-sm bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
          {currentPOIName && <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{currentPOIName}</p>}
          <p className="text-white text-sm leading-relaxed">{currentMessage}</p>
          <div className="flex items-center gap-1.5 self-end">
            {currentMessageSource === "wiki+gemini" && <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Wikipedia</span>}
            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Gemini</span>
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center">
        <ToggleButton isActive={isActive} onToggle={() => setIsActive(!isActive)} disabled={false} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsThemePanelOpen(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-full transition-colors"
        >
          <span>🎛️</span>
          <span>Thèmes</span>
          <span className="bg-gray-700 text-xs px-1.5 py-0.5 rounded-full text-gray-300">
            {activeThemeCount} / {totalThemeCount}
          </span>
        </button>
        <button
          onClick={() => setIsHistoryPanelOpen(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-full transition-colors"
        >
          <span>📍</span>
          <span>Historique</span>
          {history.length > 0 && <span className="bg-gray-700 text-xs px-1.5 py-0.5 rounded-full text-gray-300">{history.length}</span>}
        </button>
      </div>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${isThemePanelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setIsThemePanelOpen(false)}
      />

      {/* Bottom sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-2xl transition-transform duration-300 ease-out flex flex-col max-h-[80dvh] ${isThemePanelOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-6 py-3 shrink-0">
          <h2 className="text-lg font-semibold">Thèmes</h2>
          <button
            onClick={() => setIsThemePanelOpen(false)}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-800 transition-colors"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
          <ThemeSelector themeGroups={themeGroups} onToggleTheme={handleThemeToggle} onToggleGroup={handleGroupToggle} />
        </div>
      </div>

      {/* Backdrop history */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${isHistoryPanelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setIsHistoryPanelOpen(false)}
      />

      {/* Bottom sheet history */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-2xl transition-transform duration-300 ease-out flex flex-col max-h-[80dvh] ${isHistoryPanelOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-6 py-3 shrink-0">
          <h2 className="text-lg font-semibold">Historique</h2>
          <button
            onClick={() => setIsHistoryPanelOpen(false)}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-800 transition-colors"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
          {history.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Aucun lieu trouvé pour l&apos;instant.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {history.map((entry: PoiHistoryEntry, index: number) => (
                <div key={index} className="bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{entry.poiName}</p>
                    <p className="text-gray-600 text-xs">{entry.timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <p className="text-white text-sm leading-relaxed">{entry.message}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {entry.source === "wiki+gemini" && <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Wikipedia</span>}
                      <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Gemini</span>
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
                        onClick={() => deleteHistoryEntry(index)}
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
        </div>
      </div>
      {/* Backdrop settings */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${isSettingsPanelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setIsSettingsPanelOpen(false)}
      />

      {/* Bottom sheet settings */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-900 rounded-t-2xl transition-transform duration-300 ease-out flex flex-col max-h-[80dvh] ${isSettingsPanelOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-6 py-3 shrink-0">
          <h2 className="text-lg font-semibold">Réglages</h2>
          <button
            onClick={() => setIsSettingsPanelOpen(false)}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-800 transition-colors"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-10">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">Intervalle de scan</label>
              <p className="text-xs text-gray-500">Fréquence à laquelle l’app cherche des POIs à proximité.</p>
              <select
                value={settings.pollIntervalMs}
                onChange={(e) => setSettings((s) => ({ ...s, pollIntervalMs: Number(e.target.value) }))}
                className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-gray-500"
              >
                <option value={10_000}>10 secondes</option>
                <option value={20_000}>20 secondes</option>
                <option value={30_000}>30 secondes (défaut)</option>
                <option value={45_000}>45 secondes</option>
                <option value={60_000}>60 secondes</option>
                <option value={90_000}>90 secondes</option>
                <option value={120_000}>120 secondes</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">Rayon de détection</label>
              <p className="text-xs text-gray-500">Distance autour de votre position dans laquelle les POIs sont cherchés.</p>
              <select
                value={settings.detectionRadiusM}
                onChange={(e) => setSettings((s) => ({ ...s, detectionRadiusM: Number(e.target.value) }))}
                className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-gray-500"
              >
                <option value={250}>250 mètres</option>
                <option value={500}>500 mètres (défaut)</option>
                <option value={1000}>1 kilomètre</option>
                <option value={2000}>2 kilomètres</option>
                <option value={3000}>3 kilomètres</option>
                <option value={5000}>5 kilomètres</option>
                <option value={10000}>10 kilomètres</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-300">Seuil de déplacement</label>
              <p className="text-xs text-gray-500">Distance minimale à parcourir avant de relancer une recherche Overpass.</p>
              <select
                value={settings.overpassMoveThresholdM}
                onChange={(e) => setSettings((s) => ({ ...s, overpassMoveThresholdM: Number(e.target.value) }))}
                className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-gray-500"
              >
                <option value={50}>50 mètres</option>
                <option value={100}>100 mètres (défaut)</option>
                <option value={200}>200 mètres</option>
                <option value={500}>500 mètres</option>
                <option value={1000}>1 kilomètre</option>
                <option value={2000}>2 kilomètres</option>
                <option value={5000}>5 kilomètres</option>
                <option value={10000}>10 kilomètres</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
