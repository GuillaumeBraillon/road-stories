# Dossier `src/hooks/` — Hooks React personnalisés (Road Stories)

Ce dossier regroupe tous les hooks React personnalisés utilisés dans l’application Road Stories. Chaque hook encapsule une logique réactive ou un effet secondaire, en s’appuyant sur les services métier du dossier `services/`.

## Rôle du dossier

- **Encapsuler la logique réactive** (écoute GPS, gestion du cache, historique, PWA, orchestration IA)
- **Faciliter la réutilisation et la composition** dans les composants React
- **Isoler les effets secondaires** (side effects) hors des composants UI

## Structure

- `useGeolocation.ts` : Hook de surveillance GPS (écoute, erreurs, position)
- `useOverpassCache.ts` : Hook de cache POI Overpass (anti-doublon, intervalle)
- `usePoiFilter.ts` : Hook de filtrage dynamique des POI selon les thèmes
- `usePoiHistory.ts` : Hook d’historique des POI entendus
- `usePWAInstall.ts` : Hook d’installation PWA (gestion bannière, prompt)
- `useRoadStories.ts` : Hook principal d’orchestration (statut, workflow, triggers)

## Bonnes pratiques

- **Aucune logique métier dans les hooks** (tout doit passer par les services)
- **Hooks strictement typés** (TypeScript strict)
- **Effets secondaires isolés et testables**
- **Documentation JSDoc systématique**

---

**Ce dossier est réservé aux hooks React personnalisés, sans logique métier directe.**
