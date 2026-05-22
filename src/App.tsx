import { useState, useEffect } from "react";
import type { Theme, ThemeGroup, AppSettings } from "./types";
import { useRoadStories } from "./hooks/useRoadStories";
import { loadThemeGroups, saveThemeGroups, loadSettings, saveSettings } from "./services/storage";
import { ToggleButton } from "./components/ToggleButton";
import { StatusIndicator } from "./components/StatusIndicator";
import { ToolBadges } from "./components/ToolBadges";
import { ThemePanel } from "./components/ThemePanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { SettingsPanel } from "./components/SettingsPanel";
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
      { id: "musees", label: "Musées", enabled: true, osmFilters: ['"tourism"="museum"'] },
      { id: "art", label: "Art & sculptures", enabled: false, osmFilters: ['"tourism"="artwork"', '"amenity"="arts_centre"', '"tourism"="gallery"'] },
      { id: "spectacles", label: "Théâtres & opéras", enabled: false, osmFilters: ['"amenity"="theatre"', '"amenity"="opera"'] },
      { id: "sciences", label: "Sciences & planétariums", enabled: false, osmFilters: ['"amenity"="planetarium"', '"tourism"="aquarium"'] },
    ],
  },
  {
    id: "nature",
    label: "Nature & Paysages",
    icon: "🌿",
    subThemes: [
      { id: "sommets", label: "Sommets & reliefs", enabled: true, osmFilters: ['"natural"="peak"', '"natural"="ridge"', '"natural"="cliff"'] },
      { id: "eau", label: "Chutes d'eau & lacs", enabled: true, osmFilters: ['"natural"="waterfall"', '"water"="lake"', '"water"="reservoir"'] },
      { id: "grottes", label: "Grottes & cavernes", enabled: true, osmFilters: ['"natural"="cave_entrance"'] },
      {
        id: "parcs_naturels",
        label: "Parcs naturels & réserves",
        enabled: true,
        osmFilters: ['"boundary"="national_park"', '"leisure"="nature_reserve"', '"boundary"="protected_area"'],
      },
      { id: "forets", label: "Forêts remarquables", enabled: false, osmFilters: ['"natural"="wood"', '"landuse"="forest"'] },
    ],
  },
  {
    id: "tourisme",
    label: "Tourisme & Loisirs",
    icon: "🎡",
    subThemes: [
      { id: "attractions", label: "Attractions & parcs", enabled: true, osmFilters: ['"tourism"="theme_park"', '"tourism"="zoo"', '"tourism"="attraction"'] },
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
      { id: "abbayes", label: "Abbayes & monastères", enabled: false, osmFilters: ['"historic"="monastery"', '"historic"="abbey"'] },
    ],
  },
];

function flattenThemes(groups: ThemeGroup[]): Theme[] {
  return groups.flatMap((g) => g.subThemes);
}

function App() {
  const [themeGroups, setThemeGroups] = useState<ThemeGroup[]>(() => loadThemeGroups(DEFAULT_THEME_GROUPS));
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const { isInstallable, install } = usePWAInstall();

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    saveThemeGroups(themeGroups);
  }, [themeGroups]);

  const allThemes = themeGroups.flatMap((g) => g.subThemes);
  const activeThemeCount = allThemes.filter((t) => t.enabled).length;

  const { isActive, setIsActive, status, currentPOIName, currentMessage, currentToolsUsed, isMuted, setIsMuted, history, deleteHistoryEntry } = useRoadStories(
    flattenThemes(themeGroups),
    settings
  );

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

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center px-6 py-10 gap-8">
      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold tracking-tight">Road Stories</h1>
          <span className="text-xs text-gray-500">v{__APP_VERSION__}</span>
        </div>
        <div className="flex items-center gap-1">
          {isInstallable && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
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

      {/* Message courant */}
      {currentMessage && (
        <div className="w-full max-w-sm bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
          {currentPOIName && <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{currentPOIName}</p>}
          <p className="text-white text-sm leading-relaxed">{currentMessage}</p>
          <div className="self-end mt-1">
            <ToolBadges tools={currentToolsUsed} />
          </div>
        </div>
      )}

      {/* Bouton ON/OFF */}
      <div className="flex-1 flex items-center justify-center">
        <ToggleButton isActive={isActive} onToggle={() => setIsActive(!isActive)} disabled={false} />
      </div>

      {/* Boutons panneaux */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsThemePanelOpen(true)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-full transition-colors"
        >
          <span>🎛️</span>
          <span>Thèmes</span>
          <span className="bg-gray-700 text-xs px-1.5 py-0.5 rounded-full text-gray-300">
            {activeThemeCount} / {allThemes.length}
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

      {/* Panneaux */}
      <ThemePanel
        isOpen={isThemePanelOpen}
        onClose={() => setIsThemePanelOpen(false)}
        themeGroups={themeGroups}
        onToggleTheme={handleThemeToggle}
        onToggleGroup={handleGroupToggle}
      />
      <HistoryPanel isOpen={isHistoryPanelOpen} onClose={() => setIsHistoryPanelOpen(false)} history={history} onDelete={deleteHistoryEntry} />
      <SettingsPanel isOpen={isSettingsPanelOpen} onClose={() => setIsSettingsPanelOpen(false)} settings={settings} onChange={setSettings} />
    </div>
  );
}

export default App;
