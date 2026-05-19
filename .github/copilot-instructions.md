# Copilot Instructions — Road Stories

## Présentation du projet

Road Stories est une PWA mobile qui enrichit les trajets en voiture en diffusant automatiquement des anecdotes et informations culturelles sur les lieux traversés, grâce à un agent IA propulsé par Gemini 2.5 Flash.

L'app détecte la proximité de points d'intérêt via le GPS, interroge OpenStreetMap et Wikipedia, puis génère un message audio naturel via Gemini — le tout sans interaction de l'utilisateur, comme un GPS pour la culture.

---

## Stack technique

- **React 18** + **TypeScript** (strict)
- **Tailwind CSS v4** (pas de tailwind.config.js, `@import "tailwindcss"` dans index.css)
- **Vite** avec `@tailwindcss/vite`
- **Gemini 2.5 Flash** via `@google/genai`
- **Web APIs** : Geolocation, SpeechSynthesis, Media Session, Wake Lock

---

## Structure du projet

```
src/
├── components/
│   ├── ToggleButton.tsx       # Bouton ON/OFF principal
│   ├── StatusIndicator.tsx    # Indicateur d'état
│   └── ThemeSelector.tsx      # Cases à cocher des thèmes
├── services/
│   ├── geolocation.ts         # Surveillance GPS (Haversine)
│   ├── overpass.ts            # Requêtes OpenStreetMap (POST)
│   ├── wikipedia.ts           # Résumés Wikipedia REST API
│   ├── gemini.ts              # Agent Gemini (tool use + génération)
│   └── tts.ts                 # Text-to-Speech (Web Speech API)
├── hooks/
│   ├── useGeolocation.ts      # Hook GPS
│   └── useRoadStories.ts      # Orchestration principale
├── types/
│   └── index.ts               # Types partagés
├── App.tsx
└── main.tsx
```

---

## Types partagés

```typescript
// src/types/index.ts
export type Coords = { lat: number; lng: number };

export type POI = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
};

export type Theme = {
  id: string;
  label: string;
  enabled: boolean;
};

export type AppStatus = "idle" | "active" | "speaking";
```

---

## Conventions de code

### Typage et structure

- **Toujours TypeScript strict** — pas de `any`
- **Fonctions exportées individuellement** — pas de classes

### Gestion des erreurs et async

- **Async/await** — pas de `.then()`
- **Try/catch** sur tous les appels réseau

### Style et nommage

- **Pas de `reduce()`** — utiliser `map()`, `filter()`, `forEach()`
- Nommage : **camelCase** pour les fonctions, **PascalCase** pour les composants et types

---

## Gemini — Agent IA

**Package** : `@google/genai`
**Modèle** : `gemini-2.5-flash`
**Clé API** : `import.meta.env.VITE_GEMINI_API_KEY`

### Initialisation

```typescript
import { GoogleGenAI, Type } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
```

### Appel

```typescript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: prompt,
  config: {
    tools: [outilWikipedia],
    systemInstruction: systemPrompt,
  },
});
```

### Suivi des tokens (mode dev)

```typescript
const meta = response.usageMetadata;
console.log(`Tokens : ${meta.totalTokenCount}`);
```

### Tool Use

L'agent dispose d'un outil `getWikipediaSummary` qu'il peut appeler si nécessaire. Toujours vérifier `response.functionCalls` avant de retourner `response.text`.

---

## Overpass API (OpenStreetMap)

> ⚠️ Utiliser uniquement des requêtes **POST** — le GET retourne une erreur 406.

```typescript
const query = `[out:json];node["tourism"="information"](around:500,${lat},${lng});out;`;

const response = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `data=${encodeURIComponent(query)}`,
});
```

---

## Wikipedia API

```typescript
const url = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
const response = await fetch(url);
const data = await response.json();
return data.extract ?? null;
```

---

## Text-to-Speech

```typescript
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = "fr-FR";
utterance.rate = 1.0;
window.speechSynthesis.speak(utterance);
```

---

## Règles métier importantes

### GPS

- **Intervalle** : interroger Overpass toutes les 30 secondes, pas en continu
- **Rayon de détection** : 500 mètres par défaut
- **Erreurs GPS** : si le signal GPS est indisponible, notifier l'utilisateur et relancer la détection après 30 secondes

### POI

- **Anti-doublon** : un POI ne se redéclenche pas avant 30 minutes (stocker les ids dans un `Set`)

### Synthèse vocale

- **Durée du message** : 60 mots maximum (~30 secondes à l'oral)
- **Ne pas parler** si `status === 'speaking'` (pas d'interruption)

### Système

- **Wake Lock** : activer quand `isActive === true` pour éviter la mise en veille

---

## Variables d'environnement

```
VITE_GEMINI_API_KEY=ta_clé_ici
```

Ne jamais committer `.env.local` (présent dans `.gitignore`).

---

## Mode développement

En dev, simuler une position GPS fixe près d'un monument connu :

```typescript
const DEV_COORDS = { lat: 43.9467, lng: 4.5353 }; // Pont du Gard
```

Tester les données OSM sur https://overpass-turbo.eu avant de coder.
