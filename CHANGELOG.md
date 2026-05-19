# Journal des modifications (Changelog)

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet respecte le [Versionnage Sémantique](https://semver.org/spec/v2.0.0.html).

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
