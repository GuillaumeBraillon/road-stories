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

/**
 * Liste par défaut des groupes de thèmes et sous-thèmes proposés à l'utilisateur.
 * Chaque sous-thème contient un ou plusieurs filtres OSM utilisés pour les requêtes Overpass.
 * Peut être modifié dans le code pour enrichir ou adapter la couverture.
 */
const DEFAULT_THEME_GROUPS: ThemeGroup[] = [
  {
    id: "patrimoine",
    label: "Grands Monuments & Châteaux",
    icon: "🏰",
    subThemes: [
      {
        id: "chateaux",
        label: "Châteaux & Citadelles",
        enabled: true,
        osmFilters: ['"historic"="castle"', '"historic"="fort"', '"historic"="fortress"', '"historic"="palace"'],
      },
      {
        id: "monuments_majeurs",
        label: "Monuments & Édifices Historiques",
        enabled: true,
        osmFilters: ['"historic"="monument"', '"historic"="memorial"', '"historic"="aqueduct"', '"man_made"="viaduct"'],
      },
      {
        id: "archeologie",
        label: "Sites archéologiques d'envergure",
        enabled: true,
        osmFilters: ['"historic"="archaeological_site"', '"historic"="ruins"'],
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
        label: "Musées & Muséums",
        enabled: true,
        osmFilters: ['"tourism"="museum"'],
      },
      {
        id: "arts_centres",
        label: "Centres d'Art & Grandes Galeries",
        enabled: false,
        osmFilters: ['"amenity"="arts_centre"', '"tourism"="gallery"'],
      },
      {
        id: "spectacles_historiques",
        label: "Opéras, Théâtres & Scènes Nationales",
        enabled: false,
        osmFilters: ['"amenity"="theatre"', '"amenity"="opera"'],
      },
      {
        id: "sciences_culture",
        label: "Planétariums & Centres Scientifiques",
        enabled: false,
        osmFilters: ['"amenity"="planetarium"', '"tourism"="aquarium"'],
      },
    ],
  },
  {
    id: "nature",
    label: "Grands Paysages",
    icon: "🌿",
    subThemes: [
      { id: "panoramas", label: "Points de vue & Belvédères", enabled: true, osmFilters: ['"tourism"="viewpoint"'] },
      { id: "reliefs", label: "Cols, Falaises & Canyons", enabled: true, osmFilters: ['"mountain_pass"="yes"', '"natural"="cliff"', '"natural"="gorge"'] },
      { id: "eau", label: "Lacs & Grands Fleuves", enabled: true, osmFilters: ['"water"="lake"', '"water"="reservoir"'] },
      {
        id: "parcs_naturels",
        label: "Parcs naturels & Réserves",
        enabled: true,
        osmFilters: ['"boundary"="national_park"', '"leisure"="nature_reserve"'],
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
        label: "Parcs & Grandes attractions",
        enabled: true,
        osmFilters: ['"tourism"="theme_park"', '"tourism"="zoo"', '"leisure"="water_park"'],
      },
      {
        id: "infos_touristiques",
        label: "Bornes & Infos Touristiques",
        enabled: true,
        osmFilters: ['"tourism"="information"'],
      },
      {
        id: "complexes_sportifs",
        label: "Circuits & Complexes mécaniques",
        enabled: false,
        osmFilters: ['"leisure"="racetrack"'],
      },
      {
        id: "aquariums",
        label: "Aquariums & Centres marins",
        enabled: false,
        osmFilters: ['"tourism"="aquarium"'],
      },
    ],
  },
  {
    id: "religion",
    label: "Édifices Religieux Majeurs",
    icon: "⛪",
    subThemes: [
      { id: "abbayes", label: "Abbayes & Monastères", enabled: true, osmFilters: ['"historic"="monastery"', '"historic"="abbey"'] },
      {
        id: "cathedrales",
        label: "Cathédrales & Grandes Églises",
        enabled: false,
        osmFilters: ['"building"="cathedral"', '"building"="church"'], // Souvent visibles de loin
      },
    ],
  },
  {
    id: "ferroviaire",
    label: "Histoire & Patrimoine férroviaire",
    icon: "🚂",
    subThemes: [
      {
        id: "gares_historiques",
        label: "Gares Célèbres & Architecture",
        enabled: true,
        osmFilters: ['"building"="train_station"', '"historic"="station"'],
      },
      {
        id: "ouvrages_art_rail",
        label: "Viaducs & Ouvrages d'art étonnants",
        enabled: true,
        osmFilters: [
          '"man_made"="viaduct"',
          '"bridge"="viaduct"',
          // Note: capturera aussi le routier, mais Gemini fera le focus rail si présent dans les tags
        ],
      },
      {
        id: "musees_train",
        label: "Musées du Train & Lignes Touristiques",
        enabled: true,
        osmFilters: ['"railway"="museum"', '"railway"="preserved"'],
      },
    ],
  },
];

/**
 * Aplati la structure des groupes de thèmes pour obtenir la liste complète des sous-thèmes.
 * Utile pour passer tous les thèmes actifs au hook principal.
 */
function flattenThemes(groups: ThemeGroup[]): Theme[] {
  return groups.flatMap((g) => g.subThemes);
}

/**
 * Composant racine de l'application Road Stories.
 *
 * - Gère l'état global (thèmes, réglages, panneaux ouverts)
 * - Orchestre l'appel au hook métier principal `useRoadStories`
 * - Centralise l'affichage UI (boutons, panneaux, message courant)
 * - Relie la logique métier (détection, filtrage, historique, TTS) à l'interface utilisateur
 */
function App() {
  /**
   * État des groupes de thèmes sélectionnés par l'utilisateur.
   * Persisté en localStorage via `loadThemeGroups`/`saveThemeGroups`.
   */
  const [themeGroups, setThemeGroups] = useState<ThemeGroup[]>(() => loadThemeGroups(DEFAULT_THEME_GROUPS));

  /**
   * Réglages utilisateur (intervalle de scan, rayon, seuil de déplacement).
   * Persisté en localStorage via `loadSettings`/`saveSettings`.
   */
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // État d'ouverture des panneaux latéraux (thèmes, historique, réglages)
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);

  /**
   * Hook pour la gestion de l'installation PWA (affiche le bouton Installer si possible).
   */
  const { isInstallable, install } = usePWAInstall();

  // Sauvegarde automatique des réglages et thèmes à chaque modification
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    saveThemeGroups(themeGroups);
  }, [themeGroups]);

  /**
   * Liste à plat de tous les sous-thèmes (pour le compteur et la sélection).
   */
  const allThemes = themeGroups.flatMap((g) => g.subThemes);
  /**
   * Nombre de thèmes actuellement actifs (pour affichage dans le bouton).
   */
  const activeThemeCount = allThemes.filter((t) => t.enabled).length;

  /**
   * Hook principal qui orchestre toute la logique métier:
   * - Activation/désactivation du mode Road Stories
   * - Statut courant (idle, listening, searching, speaking…)
   * - Détection GPS, filtrage, gestion du cache, requêtes Overpass
   * - Génération de message IA (Gemini), synthèse vocale, gestion du mute
   * - Historique des POI déclenchés
   */
  const { isActive, setIsActive, status, currentPOIName, currentMessage, currentToolsUsed, isMuted, setIsMuted, history, deleteHistoryEntry } = useRoadStories(
    flattenThemes(themeGroups),
    settings
  );

  /**
   * État persistant pour verrouiller le titre du POI à l'écran.
   * On accepte string, undefined ET null pour correspondre exactement aux types du hook.
   */
  const [[prevPOIName, displayedPOIName], setPOIState] = useState<[string | undefined | null, string]>([undefined, ""]);

  // Alignement synchrone pendant la phase de render
  if (currentPOIName !== prevPOIName) {
    if (currentPOIName) {
      // Un nouveau POI arrive : on met à jour la valeur courante et le titre affiché
      setPOIState([currentPOIName, currentPOIName]);
    } else if (!currentMessage) {
      // Tout est vidé (reset/stop) : on nettoie complètement
      setPOIState([currentPOIName, ""]);
    } else {
      // currentPOIName passe à null/undefined mais l'anecdote est là :
      // On met à jour le témoin pour stopper le if, tout en conservant le titre actuel
      setPOIState([currentPOIName, displayedPOIName]);
    }
  }
  /**
   * Active/désactive un sous-thème donné (checkbox dans le panneau Thèmes).
   */

  function handleThemeToggle(themeId: string) {
    setThemeGroups((prev) =>
      prev.map((group) => ({
        ...group,
        subThemes: group.subThemes.map((t) => (t.id === themeId ? { ...t, enabled: !t.enabled } : t)),
      }))
    );
  }

  /**
   * Active/désactive tous les sous-thèmes d'un groupe (toggle group dans le panneau Thèmes).
   */
  function handleGroupToggle(groupId: string) {
    setThemeGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        const allEnabled = group.subThemes.every((t) => t.enabled);
        return { ...group, subThemes: group.subThemes.map((t) => ({ ...t, enabled: !allEnabled })) };
      })
    );
  }

  // --- Rendu UI principal ---
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center px-6 py-10 gap-8">
      {/* Header principal avec version, installation PWA, accès réglages et mute */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold tracking-tight">Road Stories</h1>
          {/* Affiche le bouton d'installation PWA si disponible */}
          {isInstallable && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Installer</span>
            </button>
          )}
          {/* Affiche la version de l'application (injectée à la build) */}
          <span className="text-xs text-gray-500">v{__APP_VERSION__}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Bouton réglages */}
          <button onClick={() => setIsSettingsPanelOpen(true)} className="text-2xl p-2 rounded-full hover:bg-gray-800 transition-colors" aria-label="Réglages">
            ⚙️
          </button>
          {/* Bouton mute/unmute */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-2xl p-2 rounded-full hover:bg-gray-800 transition-colors"
            aria-label={isMuted ? "Activer le son" : "Couper le son"}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>

      {/* Indicateur d'état (idle, recherche, lecture, etc.) */}
      <StatusIndicator status={status} currentPOIName={currentPOIName} detectionRadiusM={settings.detectionRadiusM} />

      {/* Message courant (anecdote en cours de lecture) */}
      {currentMessage && (
        <div className="w-full max-w-sm bg-gray-800 rounded-xl p-4 flex flex-col gap-2">
          {/* Utilisation du nom tamponné pour persister le titre à l'écran */}
          {displayedPOIName && <p className="text-gray-400 text-xs font-medium uppercase tracking-wide">{displayedPOIName}</p>}
          <p className="text-white text-sm leading-relaxed">{currentMessage}</p>
          <div className="self-end mt-1">
            <ToolBadges tools={currentToolsUsed} />
          </div>
        </div>
      )}

      {/* Bouton ON/OFF principal */}
      <div className="flex-1 flex items-center justify-center">
        <ToggleButton isActive={isActive} onToggle={() => setIsActive(!isActive)} disabled={false} />
      </div>

      {/* Boutons d'accès aux panneaux latéraux (thèmes, historique) */}
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

      {/* Panneaux latéraux (thèmes, historique, réglages) */}
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
