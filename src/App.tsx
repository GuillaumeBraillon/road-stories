import { useState } from "react";
import type { Theme, ThemeGroup } from "./types";
import { useRoadStories } from "./hooks/useRoadStories";
import { ToggleButton } from "./components/ToggleButton";
import { StatusIndicator } from "./components/StatusIndicator";
import { ThemeSelector } from "./components/ThemeSelector";

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
        osmFilters: ['"historic"="monument"', '"historic"="memorial"', '"historic"="boundary_stone"', '"historic"="milestone"'],
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
        enabled: true,
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
        id: "points_de_vue",
        label: "Points de vue panoramiques",
        enabled: true,
        osmFilters: ['"tourism"="viewpoint"'],
      },
      {
        id: "attractions",
        label: "Attractions & parcs",
        enabled: false,
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
  const [themeGroups, setThemeGroups] = useState<ThemeGroup[]>(DEFAULT_THEME_GROUPS);

  const { isActive, setIsActive, status, currentPOIName, currentMessage, currentMessageSource, isMuted, setIsMuted } = useRoadStories(
    flattenThemes(themeGroups)
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
      <div className="w-full max-w-sm flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Road Stories</h1>
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="text-2xl p-2 rounded-full hover:bg-gray-800 transition-colors"
          aria-label={isMuted ? "Activer le son" : "Couper le son"}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      </div>

      <StatusIndicator status={status} currentPOIName={currentPOIName} />

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

      <div className="w-full max-w-sm overflow-y-auto">
        <ThemeSelector themeGroups={themeGroups} onToggleTheme={handleThemeToggle} onToggleGroup={handleGroupToggle} />
      </div>
    </div>
  );
}

export default App;
