# Road Stories 🚗

PWA mobile qui enrichit vos trajets en voiture en diffusant automatiquement des anecdotes et informations culturelles sur les lieux traversés, grâce à un agent IA propulsé par Gemini 2.5 Flash.

> Comme un GPS, mais pour la culture.

---

## Fonctionnalités principales

1. **Mode ON/OFF** : activez l’app avant de partir, tout fonctionne automatiquement ensuite.
2. **Détection automatique** des points d’intérêt à proximité via le GPS (intervalle et rayon configurables).
3. **Panneaux coulissants** :
   - Sélection des thèmes (groupes, sous-thèmes, filtres OSM personnalisés)
   - Historique des lieux visités (réécoute possible)
   - Réglages utilisateur (intervalle de scan, rayon, seuil de déplacement)
4. **Pause/reprise automatique de la musique** lors de la lecture d’un message.
5. **Synthèse vocale** (~30 secondes max, voix navigateur, non interruptible).
6. **Badges d’outils IA** : Gemini, Wikipedia, Google Places (affichés sur chaque anecdote).
7. **Cache Overpass intelligent** : évite les requêtes redondantes et optimise la consommation réseau.
8. **Filtrage avancé des POI** : exclusion automatique des panneaux administratifs, lieux sans contexte, etc.
9. **Historique** : tous les POI déclenchés sont listés, avec possibilité de réécouter le message ou de supprimer une entrée.
10. **Centralisation des types et logique métier** : code maintenable, typé, et facilement extensible.

> Aucune interaction nécessaire pendant le trajet : tout est pensé pour la conduite.

---

## Stack technique

- **React 18** + **TypeScript**
- **Tailwind CSS v4** + **Vite**
- **Gemini 2.5 Flash** (`@google/genai`) — agent IA
- **OpenStreetMap** / Overpass API — points d'intérêt
- **Wikipedia REST API** — contenu encyclopédique
- **Web Speech API** — synthèse vocale
- **Geolocation API** + **Wake Lock API**

---

## Prérequis

- Node.js 20+
- Une clé API Google AI Studio (free tier) : [aistudio.google.com](https://aistudio.google.com)

---

## Installation

```bash
git clone https://github.com/ton-username/road-stories
cd road-stories
npm install
```

Créer un fichier `.env.local` à la racine :

```
VITE_GEMINI_API_KEY=ta_clé_ici
```

Lancer en développement :

```bash
npm run dev
```

---

## Thèmes disponibles

L’utilisateur choisit les thèmes et sous-thèmes qui l’intéressent, organisés en groupes :

- 🏰 Patrimoine (châteaux, monuments, sites archéologiques, curiosités géologiques…)
- 🎨 Culture & Arts (musées, œuvres, théâtres…)
- 🌿 Nature (sites naturels, parcs, curiosités…)
- 🍽️ Gastronomie locale
- 👤 Personnages célèbres
- 💡 Anecdotes insolites

Chaque sous-thème correspond à des filtres OSM précis, modifiables facilement dans le code.

---

## Limites connues

- Couverture OSM variable selon les régions
- Voix synthétique dépendante du navigateur (Web Speech API)
- Mode arrière-plan limité sur iOS (contrainte PWA Safari)
- Les réglages sont conservés localement (pas de cloud sync)
- L’IA peut parfois manquer de contexte sur certains lieux très locaux

---

## Licence

MIT
