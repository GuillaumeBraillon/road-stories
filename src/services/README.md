# Dossier `src/services/` — Services métier & helpers (Road Stories)

Ce dossier regroupe tous les services métier, helpers et modules utilitaires utilisés par l’application Road Stories côté client (PWA React).

## Rôle du dossier

- **Centraliser la logique métier** (accès API, orchestration IA, géolocalisation, TTS, stockage, etc.)
- **Fournir des helpers réutilisables** pour les hooks, composants et l’agent IA
- **Garantir la cohérence et la factorisation** du code métier (aucune logique métier dans les composants React)

## Structure

- `geolocation.ts` : Surveillance GPS, calculs de distance, gestion du watcher
- `overpass.ts` : Requêtes Overpass (OpenStreetMap), parsing POI
- `wikipedia.ts` : Appel Wikipedia REST API, parsing résumé
- `gemini.ts` : Orchestration principale Gemini (génération message audio)
- `geminiShared.ts` : Helpers Gemini (prompt, outils, marquage tool use)
- `places.ts` : Appel Google Places, formatage prix, parsing avis
- `tts.ts` : Synthèse vocale Web Speech API
- `logger.ts` : Logger centralisé (dev only)
- `storage.ts` : Stockage local (historique, thèmes, settings)
- `prompts.ts` : Génération des prompts utilisateur/système pour Gemini
- `agentTools.ts` : Déclaration des outils Gemini côté client
- `poiFilter.ts` : Helpers de filtrage POI côté client

## Bonnes pratiques

- **Aucune logique métier dans les hooks ou composants**
- **Typage strict TypeScript** (aucun any)
- **Gestion systématique des erreurs (try/catch)**
- **Documentation JSDoc systématique**

---

**Ce dossier est réservé à la logique métier, aux helpers et à l’orchestration côté client.**
