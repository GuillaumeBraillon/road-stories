# Journal des modifications (Changelog)

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet respecte le [Versionnage Sémantique](https://semver.org/spec/v2.0.0.html).

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
