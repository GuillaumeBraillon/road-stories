# Journal des modifications (Changelog)

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet respecte le [Versionnage Sémantique](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-05-20

### Ajouté

- `api/overpass.ts` — Vercel Edge Function proxy pour les requêtes Overpass API ; résout les erreurs CORS bloquantes en production (le fetch est désormais serveur→serveur)

### Modifié

- `overpass.ts` — `/api/overpass` ajouté en premier endpoint de la liste de fallback ; les endpoints directs restent actifs pour le dev local (fallback automatique si 404)

---

## [0.8.1] - 2026-05-20

### Ajouté

- `manifest.json` — captures d'écran PWA `screenshot-mobile.png` (390×844) et `screenshot-desktop.png` (1280×720, `form_factor: "wide"`) pour l'interface d'installation enrichie Chrome/Edge

### Corrigé

- Icônes PWA — viewBox `692×690` (non carré) corrigé à `692×692` lors de la génération ; `icon-192.png` et `icon-512.png` ont désormais les dimensions exactes déclarées dans le manifest
- `manifest.json` — `"purpose": "any maskable"` séparé en deux entrées distinctes (`"any"` + `"maskable"`) conformément aux recommandations W3C

---

## [0.8.0] - 2026-05-20

### Corrigé

- Icône PWA — `icon_v2.svg` converti en `icon-192.png` et `icon-512.png` ; le manifest référence désormais des PNG (Chrome ne supporte pas les SVG pour les apps installées)

---

## [0.7.0] - 2026-05-20

### Ajouté

- Bouton d'installation PWA — `usePWAInstall.ts` écoute `beforeinstallprompt` et expose `isInstallable` / `install` ; bouton visible dans l'en-tête uniquement quand l'app est installable

### Corrigé

- `usePWAInstall.ts` — `await` manquant sur `deferredPrompt.prompt()` ; converti de `const` arrow vers `export function` (convention du projet)
- `sw.js` — `self.skipWaiting()` enveloppé dans `event.waitUntil()` ; `return;` inutile dans le listener `fetch` supprimé ; commentaire erroné ("Supabase") corrigé

---

## [0.6.0] - 2026-05-20

### Ajouté

- Suppression d'une entrée d'historique — bouton 🗑️ sur chaque entrée du panneau Historique ; retire également le POI de `triggeredPOIs` pour autoriser la re-détection ultérieure
- Panneau Réglages — bottom sheet ⚙️ accessible en haut à droite (à côté du bouton muet) avec trois paramètres configurables : intervalle de scan (10 / 20 / 30 / 60 s), rayon de détection (250 m / 500 m / 1 km / 2 km), seuil de déplacement Overpass (50 / 100 / 200 / 500 m) ; valeurs persistées en localStorage via `loadSettings` / `saveSettings` ; type `AppSettings` et constante `DEFAULT_SETTINGS` ajoutés dans `types/index.ts`
- Log du prompt complet envoyé à Gemini — `=== System prompt ===` et `=== User prompt ===` dans la console de développement à chaque appel

### Modifié

- `gemini.ts` refactorisé — `SYSTEM_PROMPT` converti en constante (plus de fonction `buildSystemPrompt`) ; `handleFunctionCall` ne reçoit plus `systemPrompt` en paramètre ; boucle retry simplifiée en `for (let attempt = 0; …)`
- `useRoadStories.ts` — les trois constantes de configuration (`POLL_INTERVAL_MS`, `DETECTION_RADIUS_M`, `OVERPASS_MOVE_THRESHOLD_M`) sont remplacées par le paramètre `settings: AppSettings` ; l'intervalle de scan est inclus dans les dépendances du `useEffect` principal ; le rayon et le seuil sont lus via `settingsRef` à chaque tick ; un changement de settings invalide le cache Overpass

---

## [0.5.0] - 2026-05-20

### Ajouté

- Mode muet — bouton 🔇/🔊 dans l'en-tête ; Gemini génère le message mais la TTS est sautée ; le message reste affiché jusqu'au prochain POI ; activer le mute pendant la lecture stoppe immédiatement la voix
- Affichage du texte généré — bloc dédié sous l'indicateur de statut, visible pendant la lecture (mode normal) et persistant jusqu'au POI suivant (mode muet) ; le nom du POI apparaît en en-tête du bloc
- Badges de source — `Wikipedia` et/ou `Gemini` en bas du bloc message selon l'origine du contenu
- `currentMessage` et `currentMessageSource` dans `useRoadStories.ts` — états dédiés pour le texte généré et sa source (`"gemini"` | `"wiki+gemini"`)
- `operator` comme nom de fallback dans `resolvePoiName` (`overpass.ts`) — les nœuds sans `name` mais avec un `operator` (ex : "Parc Naturel Régional du Vercors") utilisent l'opérateur comme identifiant pour la recherche Wikipedia
- `"operator"` ajouté dans `CULTURAL_TAG_PREFIXES` (`gemini.ts`) — transmis à Gemini pour contextualiser la génération

### Modifié

- Pré-filtrage synchrone des POIs dans `useRoadStories.ts` — les POIs sans tags enrichissants (`ENRICHING_TAGS`) sont sautés immédiatement dans une boucle plutôt qu'en retournant et attendant le prochain tick de 30 secondes ; le check post-Wikipedia est simplifié au seul cas guidepost
- Normalisation des titres Wikipedia dans `wikipedia.ts` — conversion tout en minuscules + espaces → underscores avant l'appel REST ; Wikipedia gère les redirections vers la casse canonique
- `buildUserPrompt` dans `gemini.ts` — prompt dédié quand le nom du POI est une inscription gravée : Gemini est invité à traduire et expliquer l'inscription plutôt qu'à décrire un lieu
- `useRoadStories.ts` — la recherche Wikipedia est sautée quand le nom vient d'une `inscription` ; mutex TTS non verrouillé en mode muet

### Corrigé

- Délai de 30 secondes après filtrage d'un POI sans contexte — remplacé par une boucle synchrone passant directement au POI suivant
- Titres Wikipedia avec espaces ou casse mixte retournant 404 — corrigé par normalisation lowercase + underscores
- Gemini inventait des informations sur des lieux connus à partir d'une inscription latine — prompt dédié résolvant le problème

---

## [0.4.2] - 2026-05-20

### Modifié

- `resolvePoiName` dans `overpass.ts` — branches dérivées (`historic`, `tourism`, `natural`) supprimées : un POI n'est désormais retenu que s'il possède un tag `name`/`name:fr` explicite ou une `inscription` gravée ; les viewpoints, peaks, ruines sans nom propre sont silencieusement écartés
- `GENERIC_NAMES` dans `overpass.ts` — nettoyé : ne contient plus que les noms d'infrastructure routière générique (`tunnel`, `rue`, `carrefour`…) ; les types OSM naturels retirés (devenus inutiles sans branche `natural`)
- `capitalize` dans `overpass.ts` — fonction supprimée (plus aucun usage après la simplification de `resolvePoiName`)
- `useRoadStories.ts` — la recherche Wikipedia est sautée quand le nom du POI provient d'une `inscription` (évite un 404 systématique en console avec le texte latin comme titre)
- `buildUserPrompt` dans `gemini.ts` — prompt dédié quand le nom est une inscription gravée : Gemini est invité à traduire et expliquer l'inscription plutôt qu'à décrire un lieu, empêchant les inventions sur des monuments connus

---

## [0.4.1] - 2026-05-19

### Corrigé

- `overpass-api.de` déplacé en dernier dans la liste des endpoints de fallback (`kumi.systems` et `private.coffee` en priorité, plus fiables depuis une origine tierce)

---

## [0.4.0] - 2026-05-19

### Ajouté

- Architecture `ThemeGroup` dans `App.tsx` — les thèmes sont regroupés en 5 catégories (Patrimoine, Culture & Arts, Nature & Paysages, Tourisme & Loisirs, Lieux de culte) avec icône et sous-thèmes activables individuellement
- `ALWAYS_ACTIVE_FILTERS` dans `overpass.ts` — `tourism=information` toujours inclus indépendamment des thèmes sélectionnés
- Filtrage des guideposts sans fiche Wikipedia dans `useRoadStories.ts` — les panneaux indicateurs sans contexte suffisant sont ignorés silencieusement

### Modifié

- `getNodeName` + `isMeaningfulName` fusionnés en `resolvePoiName` dans `overpass.ts` — résolution du nom OSM avec filtrage des noms génériques intégré ; la fonction retourne `null` directement plutôt qu'un post-check externe
- `GENERIC_NAMES` dans `overpass.ts` — détection des noms d'infrastructure routière (`tunnel`, `rue`, `carrefour`…) et de types OSM non spécifiques (`ruins`, `building`) désormais intégrée dans `resolvePoiName`
- `useRoadStories.ts` — récupération Wikipedia et skip guidepost déplacés **avant** l'activation de l'état `speaking` pour éviter un flash d'UI inutile sur les POIs ignorés
- `inscription` et `information` ajoutés dans `CULTURAL_TAG_PREFIXES` de `gemini.ts` — les textes gravés et les types de panneaux sont transmis à Gemini
- Filtres OSM par thème enrichis dans `DEFAULT_THEME_GROUPS` (Patrimoine : 5 sous-thèmes ; Culture, Nature, Religion : nouveaux types ajoutés)

---

## [0.3.0] - 2026-05-19

### Ajouté

- `Theme.osmFilters` — chaque thème porte ses propres filtres OSM (`string[]`) utilisés dans la requête Overpass
- `DEFAULT_THEMES` redessinés avec 4 thèmes OSM : Patrimoine & histoire (`historic`), Attractions touristiques (`tourism=attraction/museum/artwork/information`), Nature & paysages (`natural=peak/waterfall/cave_entrance`), Lieux de culte (`amenity=place_of_worship`)
- Cache Overpass dans `useRoadStories` : Overpass n'est interrogé que si le déplacement dépasse 100 m ou si les thèmes ont changé
- Tags OSM dans le prompt Gemini : les tags culturellement pertinents du POI (`historic`, `tourism`, `start_date`, `heritage`, `description`, `ele`…) sont transmis à Gemini pour ancrer la génération
- Résolution Wikipedia via le tag OSM `wikipedia` : si le nœud OSM porte un tag `wikipedia=fr:…`, ce titre est utilisé directement pour la recherche Wikipedia

### Modifié

- `buildQuery` dans `overpass.ts` — génération dynamique des nœuds Overpass à partir des `osmFilters` des thèmes actifs ; retourne `[]` immédiatement si aucun thème n'est activé
- `getNearbyPOIs` — nouvelle signature : `(coords, themes, radiusMeters?)` remplace le filtre OSM codé en dur
- `generateRoadMessage` — `GenerateMessageParams` étendu avec `coords` et `poiTags` ; `buildUserPrompt` inclut les coordonnées GPS et les tags OSM filtrés
- Prompt système Gemini renforcé : instruction explicite de ne pas inventer de détails géographiques ou historiques si les informations disponibles ne permettent pas d'identifier le lieu avec certitude

---

## [0.2.0] - 2026-05-19

### Ajouté

- `src/types/index.ts` — types partagés : `Coords`, `POI`, `Theme`, `AppStatus`
- `src/services/geolocation.ts` — `watchPosition`, `clearWatch`, `calculateDistance` (Haversine)
- `src/services/overpass.ts` — `getNearbyPOIs` via Overpass API (POST) avec union de filtres OSM
- `src/services/wikipedia.ts` — `getWikipediaSummary` avec timeout 5 s et gestion 404/réseau
- `src/services/tts.ts` — `speak`, `stop`, `isSpeaking` via Web Speech API
- `src/services/gemini.ts` — `generateRoadMessage` avec agent Gemini 2.5 Flash et tool use Wikipedia
- `src/hooks/useGeolocation.ts` — hook GPS avec `watchPosition` et cleanup automatique
- `src/hooks/useRoadStories.ts` — hook d'orchestration principal (interval 30 s, Wake Lock, anti-doublon)
- `src/components/ToggleButton.tsx` — bouton ON/OFF rond avec `animate-pulse`
- `src/components/StatusIndicator.tsx` — affichage de l'état `idle` / `active` / `speaking`
- `src/components/ThemeSelector.tsx` — liste de cases à cocher pour les 6 thèmes
- `src/App.tsx` — interface principale Road Stories (remplace le scaffold Vite)
- `src/services/logger.ts` — utilitaire de logging conditionnel (`log`, `debug`, `warn`, `error`, `group`) avec activation via `VITE_ENABLE_DEBUG_LOGS`

---

## [0.1.0] - 2026-05-19

### Ajouté

- Scaffold du projet : React 19, TypeScript strict, Vite, Tailwind CSS v4
- Intégration du SDK Gemini 2.5 Flash (`@google/genai`)
- Configuration ESLint (TypeScript, React Hooks, React Refresh) et Prettier
- Scripts npm : `dev`, `build`, `lint`, `fix`, `format`, `tsc`
- Git hooks `pre-commit` (lint + format) et `post-commit`
- Instructions développeur Copilot (`.github/copilot-instructions.md`)

---

## [0.0.1] - 2026-05-19

- Version initiale de l'application (première release publique)
