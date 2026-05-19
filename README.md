# Road Stories 🚗

PWA mobile qui enrichit vos trajets en voiture en diffusant automatiquement des anecdotes et informations culturelles sur les lieux traversés, grâce à un agent IA propulsé par Gemini 2.5 Flash.

> Comme un GPS, mais pour la culture.

---

## Fonctionnement

1. Appuyez sur **ON** avant de partir
2. L'app détecte les points d'intérêt à proximité via le GPS
3. La musique se met en pause automatiquement
4. Un message audio généré par IA est lu (~30 secondes)
5. La musique reprend

Aucune interaction nécessaire pendant le trajet.

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

L'utilisateur choisit les thèmes qui l'intéressent :

- 🏛️ Monuments historiques
- 🏙️ Histoire des villes
- 🌿 Curiosités naturelles
- 💡 Anecdotes insolites
- 🍽️ Gastronomie locale
- 👤 Personnages célèbres

---

## Limites connues

- Couverture OSM variable selon les régions
- Voix synthétique dépendante du navigateur (Web Speech API)
- Mode arrière-plan limité sur iOS (contrainte PWA Safari)

---

## Licence

MIT
