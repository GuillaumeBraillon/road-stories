# Road Stories — Audit v1.0.8

---

## Vue d'ensemble

L'application est dans un excellent état général pour un projet en développement rapide. L'architecture est cohérente, le code TypeScript est strict, et les décisions techniques sont solides. Cet audit identifie les points à améliorer sans remettre en cause les fondations.

**Score global : 8/10**

---

## ✅ Ce qui est bien fait

### Architecture

- Séparation claire services / hooks / composants
- Edge Functions Vercel isolées dans `api/`
- Registre d'outils centralisé (`agentTools.ts`, `api/tools/index.ts`)
- Types partagés dans `types/index.ts`
- Prompts extraits dans `prompts.ts` — réutilisés côté serveur et client

### Code

- TypeScript strict partout, pas de `any` sauvage
- `Promise.all` pour les appels d'outils parallèles
- Cache Overpass avec invalidation intelligente (déplacement + thèmes)
- Wake Lock avec optional chaining (`navigator.wakeLock?.`)
- Refs miroirs pour éviter les stale closures dans les intervals
- `isUsefulToolResult` — validation centralisée des résultats d'outils

### Sécurité

- Clé Gemini déplacée côté serveur depuis v1.0.0
- Clé Places côté serveur uniquement
- FieldMask strict sur Google Places

---

## 🔴 Problèmes critiques

### 1. Duplication de logique Places entre dev et prod

**Problème** : La logique de pré-fetch Google Places est dupliquée en deux endroits :

- `src/services/gemini.ts` (dev local)
- `api/gemini.ts` (production)

Les deux blocs `isEstablishment`, `isUsefulToolResult`, et la construction du prompt enrichi sont copiés-collés. Un bug corrigé d'un côté ne l'est pas de l'autre.

**Impact** : Comportement différent en dev et prod, maintenance double.

**Solution** : Extraire la logique de pré-fetch dans un module partagé ou déplacer toute la logique côté Edge Function et appeler `/api/gemini` même en dev (avec `vercel dev`).

---

### 3. `AppStatus` contient `"wikipedia"` mais n'est plus utilisé

**Problème** : Le statut `"wikipedia"` est déclaré dans `types/index.ts` et géré dans `StatusIndicator.tsx`, mais `useRoadStories.ts` ne l'utilise plus — Wikipedia est appelé par Gemini en interne.

**Impact** : Code mort, confusion pour les futurs développeurs.

**Solution** : Supprimer `"wikipedia"` de `AppStatus` et de `StatusIndicator`.

---

## 🟡 Problèmes importants

### 4. `useRoadStories` fait trop de choses

**Problème** : Le hook gère en même temps :

- La boucle de détection GPS
- Le cache Overpass
- Le filtrage des POIs
- L'orchestration Gemini
- L'historique
- Le Wake Lock
- Le mode muet
- Les settings

C'est **450+ lignes** dans un seul hook.

**Solution** : Extraire au minimum :

- `usePoiFilter(pois)` — logique de filtrage/enrichissement
- `useOverpassCache(coords, themes, settings)` — cache + fetch Overpass
- L'historique pourrait être un `usePoiHistory()`

---

### 5. `types/index.ts` est surchargé

**Problème** : Le fichier contient 100+ lignes mêlant des types métier (`POI`, `Theme`), des types d'API Google (`GooglePlacesTextSearchRequest`, `GooglePlacesPlace`), des types utilitaires (`FormatPriceLevel`, `GetPlaceDetails`) et des interfaces de proxy (`PlacesProxyRequestBody`).

**Solution** :

```
src/types/
├── index.ts          ← types métier uniquement (POI, Theme, AppStatus...)
├── places.types.ts   ← types Google Places API
└── gemini.types.ts   ← GeminiResult, GenerateMessageParams
```

---

### 6. Logique de filtrage POI dans `useRoadStories` et `prompts.ts`

**Problème** : La fonction `shouldSkipPOI` est dans `prompts.ts` (mauvais endroit — les prompts ne devraient pas filtrer des POIs). La logique de filtrage dans `useRoadStories` est longue et mélangée avec l'orchestration.

**Solution** : Créer `src/services/poiFilter.ts` qui exporte :

```typescript
export function shouldSkipPOI(tags: Record<string, string>): boolean;
export function hasEnoughContext(tags: Record<string, string>): boolean;
export function isEligibleForTools(tags: Record<string, string>): boolean;
```

---

### 7. `App.tsx` gère trop d'état UI

**Problème** : `App.tsx` gère 6 états distincts (`isThemePanelOpen`, `isHistoryPanelOpen`, `isSettingsPanelOpen`, `playingIndex`, `settings`, `themeGroups`) et contient 3 bottom sheets inline.

**Solution** : Extraire les bottom sheets en composants :

```
src/components/
├── BottomSheet.tsx         ← composant générique réutilisable
├── ThemePanel.tsx          ← bottom sheet thèmes
├── HistoryPanel.tsx        ← bottom sheet historique
└── SettingsPanel.tsx       ← bottom sheet réglages
```

---

### 8. `ToolBadges` dans `App.tsx`

**Problème** : Le composant `ToolBadges` est défini directement dans `App.tsx` alors qu'il est utilisé dans deux endroits (message courant + historique).

**Solution** : Déplacer dans `src/components/ToolBadges.tsx`.

---

## 🟠 Points d'amélioration

### 9. Pas de gestion d'erreur visible pour l'utilisateur

**Problème** : Les erreurs sont loggées mais jamais affichées à l'utilisateur. Si Gemini échoue, Overpass échoue, ou Places échoue, l'utilisateur ne voit rien.

**Solution** : Ajouter un état `lastError` dans `useRoadStories` et un toast/snackbar discret dans l'UI :

```typescript
const [lastError, setLastError] = useState<string | null>(null);
// Dans catch : setLastError("Erreur de connexion — réessai au prochain tick")
```

---

### 10. `README.md` n'est pas à jour

**Problème** : Le README mentionne encore les 6 thèmes de base et n'inclut pas :

- Google Places
- La clé `GOOGLE_PLACES_API_KEY`
- Le script `dev:vercel`
- La PWA et l'installation
- Les variables d'environnement complètes

---

### 11. Pas de tests

**Problème** : Aucun test unitaire sur les fonctions pures critiques :

- `resolvePoiName` (overpass.ts)
- `buildUserPrompt` (prompts.ts)
- `formatPriceLevel` (places.ts)
- `isUsefulToolResult` (gemini.ts)
- `shouldSkipPOI` (prompts.ts)
- `calculateDistance` (geolocation.ts)

Ces fonctions sont stables et testables sans mock. Un test unitaire aurait détecté le bug `"wikipedia"` mort dans AppStatus.

**Solution** : Vitest est déjà dans le stack Vite — ajouter `src/services/__tests__/` avec des tests unitaires sur les fonctions pures.

---

### 12. `src/App.css` contient encore le CSS Vite

**Problème** : Le fichier `App.css` contient tous les styles du scaffold Vite (`.hero`, `#next-steps`, `.ticks`…) qui ne sont jamais utilisés.

**Solution** : Supprimer `App.css` et son import dans `App.tsx`.

---

### 13. Gestion `thought_signature` fragile

**Problème** : Dans `api/gemini.ts`, le commentaire mentionne que les `functionCall` bruts sont conservés pour éviter l'erreur `thought_signature`. C'est un workaround documenté mais pas testé de façon robuste.

**Solution** : Ajouter un test d'intégration ou au minimum un log explicite si `thought_signature` est absent pour détecter les régressions.

---

### 14. Cache Places uniquement côté CDN Vercel

**Problème** : Le cache Places est géré par `Cache-Control` CDN Vercel en production, mais en dev local via le middleware Vite il n'y a pas de cache. Chaque tick peut rappeler Places pour le même POI en dev.

**Solution** : Ajouter un cache mémoire léger côté `src/services/places.ts` pour le dev :

```typescript
const devCache = new Map<string, { result: PlaceResult; cachedAt: number }>();
```

---

## 📊 Résumé par priorité

| Priorité        | Problème                            | Effort | Impact |
| --------------- | ----------------------------------- | ------ | ------ |
| 🔴 Critique     | Duplication logique Places dev/prod | Moyen  | Élevé  |
| 🔴 Critique     | Modèle Gemini à vérifier            | Faible | Élevé  |
| 🔴 Critique     | `AppStatus "wikipedia"` mort        | Faible | Moyen  |
| 🟡 Important    | `useRoadStories` trop gros          | Élevé  | Moyen  |
| 🟡 Important    | `types/index.ts` surchargé          | Moyen  | Moyen  |
| 🟡 Important    | `shouldSkipPOI` mal placé           | Faible | Faible |
| 🟡 Important    | `App.tsx` trop de responsabilités   | Moyen  | Moyen  |
| 🟡 Important    | `ToolBadges` dans App.tsx           | Faible | Faible |
| 🟠 Amélioration | Erreurs non visibles utilisateur    | Moyen  | Élevé  |
| 🟠 Amélioration | README obsolète                     | Faible | Faible |
| 🟠 Amélioration | Pas de tests                        | Élevé  | Moyen  |
| 🟠 Amélioration | `App.css` Vite non supprimé         | Faible | Faible |
| 🟠 Amélioration | Cache Places absent en dev          | Faible | Faible |

---

## Recommandations par ordre d'exécution

1. **Vérifier le nom du modèle Gemini** dans Google AI Studio (5 minutes)
2. **Supprimer `"wikipedia"` de `AppStatus`** — dead code simple à retirer
3. **Supprimer `App.css`** — 2 lignes
4. **Déplacer `ToolBadges`** dans `src/components/ToolBadges.tsx`
5. **Déplacer `shouldSkipPOI`** dans `src/services/poiFilter.ts`
6. **Mettre à jour le README** avec les vraies variables d'environnement
7. **Extraire les bottom sheets** en composants séparés
8. **Séparer `types/index.ts`** en sous-fichiers
9. **Résoudre la duplication dev/prod** dans `gemini.ts`
10. **Ajouter Vitest** avec les premiers tests sur les fonctions pures
