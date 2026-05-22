# Spécifications Techniques — Road Stories v2.0

## 1. Vue d'ensemble de l'Architecture

Road Stories est une application web progressive (PWA) de guide culturel audio en temps réel. Elle s'appuie sur la géolocalisation de l'utilisateur pour interroger l'API OpenStreetMap (Overpass), filtre intelligemment les points d'intérêt (POI) pertinents selon un **Profil de Déplacement**, enrichit ces données à la volée via des API tierces (Wikipédia, Google Places) et génère un récit narratif audio fluide à l'aide de Gemini 3.1 Flash Lite et de la synthèse vocale (TTS) native du navigateur.

```
+---------------------------------------------------------------------------------+
|                                    FRONTEND                                     |
|                                                                                 |
|  +--------------------+      +-----------------------+     +-----------------+  |
|  |      App.tsx       | ---> |    useRoadStories     | --> | useGeolocation  |  |
|  +--------------------+      +-----------------------+     +-----------------+  |
|            |                             |                                      |
|            v                             v                                      |
|  +--------------------+      +-----------------------+                          |
|  |    Panels & UI     |      |   useOverpassCache    |                          |
|  +--------------------+      +-----------------------+                          |
|                                          |                                      |
|                                          v                                      |
|                              +-----------------------+                          |
|                              |     usePoiFilter      |                          |
|                              +-----------------------+                          |
+------------------------------------------|--------------------------------------+
                                           v
                        +-------------------------------------+
                        |          SERVEUR / EDGE             |
                        |                                     |
                        |   /api/overpass   /api/gemini       |
                        |                        |            |
                        |                        v            |
                        |                  [ agentTools ]     |
                        |                  - Wikipedia        |
                        |                  - Google Places    |
                        +-------------------------------------+

```

---

## 2. Modèle de Données & Configuration (`core.types.ts`)

Le fichier de types central est étendu pour intégrer la notion de mode de transport et lier les configurations dynamiques de recherche.

### Extrait des types fondamentaux

```typescript
export type Coords = { lat: number; lng: number };

export type POI = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
};

export type AppStatus = "idle" | "listening" | "searching" | "no-poi" | "generating" | "speaking";

// Identifiants des profils disponibles
export type TransportModeId = "pedestrian_urban" | "pedestrian_rural" | "bicycle_urban" | "car_balade" | "car_highway";

export type AppSettings = {
  currentModeId: TransportModeId; // Profil actif
  pollIntervalMs: number; // Fréquence du cycle d'analyse
  detectionRadiusM: number; // Rayon de recherche Overpass
  overpassMoveThresholdM: number; // Seuil de déplacement minimal pour requêter Overpass
};
```

### Matrice de Configuration des Profils (`transportModes.json`)

La configuration est externalisée pour permettre une scalabilité infinie (ajout de profils sans modifier le code de filtrage ou de rendu).

```json
{
  "pedestrian_urban": {
    "id": "pedestrian_urban",
    "label": "Piéton (Ville)",
    "icon": "🏙️🚶‍♂️",
    "settings": { "detectionRadiusM": 80, "overpassMoveThresholdM": 20, "pollIntervalMs": 20000 },
    "allowedThemeGroups": ["patrimoine", "art_urbain", "commerces"],
    "excludedOsmTags": { "highway": ["motorway", "trunk", "primary"] }
  },
  "car_highway": {
    "id": "car_highway",
    "label": "Voiture (Autoroute)",
    "icon": "🛣️🚗",
    "settings": { "detectionRadiusM": 4000, "overpassMoveThresholdM": 2000, "pollIntervalMs": 3000 },
    "allowedThemeGroups": ["grands_monuments", "geographie_majeure"],
    "excludedOsmTags": {
      "amenity": ["bench", "waste_basket", "bicycle_parking"],
      "historic": ["boundary_stone", "milestone"]
    }
  }
}
```

---

## 3. Algorithme de Filtrage Contextuel (`poiFilter.ts`)

Responsabilité unique : Déterminer si un POI extrait d'OpenStreetMap est digne d'intérêt culturel selon le contexte de déplacement actuel de l'utilisateur.

L'ordre d'exécution est optimisé du traitement **le moins coûteux** au **plus coûteux**.

```
[Entrée POI]
     |
     v
+------------------------------------------+
| 1. Garde-fou Anti-Pollution              |
| (Exclure si panneau d'affichage,        | --> Oui --> [IGNORER LE POI]
|  plan de bus, règlement de square)       |
+------------------------------------------+
     | Non
     v
+------------------------------------------+
| 2. Filtre Dynamique par Profil (JSON)    |
| (Exclure si tag présent dans la liste    | --> Oui --> [IGNORER LE POI]
|  noire du profil actif : ex. banc/borne) |
+------------------------------------------+
     | Non
     v
+------------------------------------------+
| 3. Analyse de Richesse Contextuelle      |
| (Possède un tag de description, auteur,  |
|  ou est éligible Wikipedia/Google Places)| --> Non --> [IGNORER LE POI]
+------------------------------------------+
     | Oui
     v
[POI ACCEPTE ET ENVOYÉ A GEMINI]

```

---

## 4. Les Hooks et Gestion du Cycle de Vie

### A. `useOverpassCache.ts`

- **Rôle** : Gérer la persistance en mémoire des POI géolocalisés pour minimiser les requêtes réseau vers le serveur Overpass.
- **Comportement** :
- Il n'interroge l'API que si la distance calculée (formule de Haversine) entre la position actuelle et la position du dernier fetch dépasse `settings.overpassMoveThresholdM`.
- Il invalide le cache immédiatement si la liste des thèmes activés change (`themesKey`).

- **Signature** :

```typescript
export function useOverpassCache(): {
  fetchPOIs: (coords: Coords, themes: Theme[], settings: AppSettings) => Promise<{ pois: POI[]; fromCache: boolean }>;
  invalidate: () => void;
};
```

### B. `usePoiFilter.ts`

- **Rôle** : Hook fonctionnel sans état interne réactif. Il expose une fonction pure chargée de parcourir la liste des POI et de désigner la cible suivante.
- **Comportement** : Il utilise la fonction `shouldSkipPOI` en lui fournissant les tags et l'identifiant du mode de transport actuel pour écarter dynamiquement les éléments indésirables avant d'affecter le POI.
- **Signature** :

```typescript
export function usePoiFilter(): {
  findNextPOI: (pois: POI[], hasTriggered: (id: string) => boolean, markTriggered: (id: string) => void, currentModeId: TransportModeId) => POI | undefined;
};
```

### C. `useRoadStories.ts` (L'Orchestrateur)

C'est le chef d'orchestre de l'application. Il contient la boucle temporelle (`setInterval`) cadencée sur `settings.pollIntervalMs`.

```
                  [ cycle TICK() toutes les X secondes ]
                                    |
                                    v
                       Est-ce qu'on est en train de
                     parler ou de chercher sur Overpass ?
                                    |
                           +--------+--------+
                           | Oui             | Non
                           v                 v
                     [Ignorer le tick]   Fetch des POI
                                         (useOverpassCache)
                                             |
                                             v
                                      Appel findNextPOI
                                        (usePoiFilter)
                                             |
                                   +---------+---------+
                                   | Non               | Oui (POI trouvé)
                                   v                   v
                            [Attente cycle]    1. Changement statut "generating"
                                               2. Prefetch Google Places (si éligible)
                                               3. Appel API Gemini (/api/gemini)
                                               4. Sauvegarde Historique (usePoiHistory)
                                               5. Synthèse Vocale (TTS)

```

---

## 5. Moteur d'Intelligence Artificielle & Prompts (`prompts.ts` & `/api/gemini`)

L'application utilise le modèle serveur `gemini-3.1-flash-lite`. La clé d'API et l'exécution des outils (`agentTools.ts`) s'effectuent côté serveur (Vercel Edge Runtime) pour des raisons de sécurité et de performances.

### Génération Dynamique du Prompt Système

Le prompt système de base est enrichi dynamiquement en fonction du mode de transport sélectionné afin de modifier le style narratif de l'IA et de garantir la sécurité de l'utilisateur.

```typescript
export function buildSystemPromptWithContext(modeId: TransportModeId): string {
  const modeConfig = transportModes[modeId];
  const basePrompt = `Tu es un guide culturel... Message audio de max 30s...`;

  return `${basePrompt}
  [CONSIGNE CONTEXTUELLE DE DÉPLACEMENT IMPÉRATIVE]
  L'utilisateur se déplace actuellement en mode : "${modeConfig.label}" ${modeConfig.icon}.
  - Interdiction formelle d'utiliser des termes directifs instantanés ou précis ("à votre droite", "dans 20 mètres") car la vitesse rend l'indication obsolète et dangereuse. Utilisez plutôt des formulations régionales ("À proximité", "Dans les environs").
  - Si le mode est RAPIDE (ex: Autoroute) : Focalise-toi sur les grands récits historiques, la géographie majeure ou les monuments imposants visibles de loin.
  - Si le mode est LENT (ex: Piéton) : Privilégie les détails de micro-patrimoine, l'architecture immédiate et les anecdotes locales.`;
}
```

### Chaînage d'Outils (Function Calling)

L'agent Gemini possède deux outils majeurs déclarés en JSON brut :

1. `getWikipediaSummary` : Appelé en priorité si le POI possède un intérêt historique documenté.
2. `getPlaceDetails` : Appelé pour les établissements recevant du public (horaires, avis, notes, prix). En environnement de production, ces données sont pré-injectées (Pre-fetch) pour optimiser les performances.

---

## 6. Interface Utilisateur & Flux Global (`App.tsx`)

L'interface utilisateur adopte une approche minimaliste "Zéro Interaction" une fois lancée :

1. **Écran Central** : Un bouton d'activation massif (`ToggleButton`) affichant des états clairs via `StatusIndicator` (`listening`, `generating`, `speaking`).
2. **Sélecteur de Profil** : Un composant horizontal permettant de basculer instantanément de profil (ex: passer de "Voiture" à "Piéton Ville"). Ce clic applique immédiatement les nouvelles configurations de rayon, d'intervalle et réinitialise le cache Overpass de manière transparente.
3. **Panneaux Tiroirs (Sliding Panels)** :

- `ThemePanel` : Pour filtrer finement les catégories OSM recherchées.
- `HistoryPanel` : Pour relire les récits des lieux traversés et réécouter le texte.
- `SettingsPanel` : Pour monitorer les variables brutes si nécessaire.
