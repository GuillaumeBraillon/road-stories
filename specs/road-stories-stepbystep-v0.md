# Road Stories — Guide de développement step by step

Stack : React 18 \+ TypeScript \+ Tailwind CSS \+ Gemini 2.5 Flash \+ Vite

---

## Prérequis

- Node.js 20+
- VSCode \+ GitHub Copilot activé

### Google AI Studio — Free Tier

1. Aller sur Google AI Studio.
2. Clique sur "Create new project" (Créer un nouveau projet).
3. Donne-lui un nom (par exemple : Apprentissage-Agent-JS).
4. Une fois dans ce nouveau projet, clique sur le gros bouton bleu "Get API key".
5. Clique sur "Create API key in new project".
6. Copie cette nouvelle clé.
7. Copier la clé dans `.env.local`

⚠️ Ce projet n'étant pas lié à ton compte de facturation Google Cloud, il est automatiquement bridé sur le Free Tier. Si ton code JavaScript s'emballe, l'API s'arrêtera toute seule gratuitement dès la 15ème requête dans la minute. Aucun risque financier.

| Modèle                                       | Ce qu'il fait le mieux                      | Pourquoi l'utiliser pour ton agent ?                                                                                                            |
| :------------------------------------------- | :------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| gemini-2.5-flash **(ou** gemini-3-flash**)** | **Ultra-rapide et léger.**                  | **Le meilleur choix pour débuter. Il comprend très bien les appels de fonctions (_Function Calling_) et répond instantanément.**                |
| gemini-2.5-pro                               | **Raisonnement complexe, logique poussée.** | **À utiliser si ton agent doit résoudre des problèmes de code compliqués ou analyser de gros volumes de données. Attention, il est plus lent.** |
| text-embedding-004                           | **Modèle d'Embebding (vectorisation).**     | **Indispensable si tu veux créer plus tard un agent de type RAG (un agent capable de fouiller dans des PDF ou des documents locaux textuels).** |

Largement suffisant pour Road Stories — l'agent n'est appelé qu'à chaque POI détecté, soit \~10 à 20 fois par trajet maximum.

---

## STEP 1 — Initialisation du projet

### 1.1 Créer le projet Vite

git clone https://github.com/ton-username/road-stories  
cd road-stories  
npm create vite@latest . \-- \--template react-ts

### 1.2 Installer les dépendances

\# Tailwind CSS v4  
npm install \-D tailwindcss @tailwindcss/vite

\# SDK Gemini  
npm install @google/genai

\# Variables d'environnement  
npm install \-D dotenv

### 1.3 Configurer Tailwind

Dans \`vite.config.ts\` ajouter le plugin Tailwind :  
import { defineConfig } from 'vite'  
import react from '@vitejs/plugin-react'  
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({  
 plugins: \[  
 react(),  
 tailwindcss(),  
 \],  
})

Dans \`src/index.css\`, remplacer tout le contenu par :  
@import "tailwindcss";  
ℹ️ Tailwind v4 ne nécessite plus de \`tailwind.config.js\` ni de \`postcss.config.js\`.

### 1.4 Variables d'environnement

Créer `.env.local` à la racine :  
VITE_GEMINI_API_KEY=ta_clé_ici  
Ajouter `.env.local` dans `.gitignore`.

---

##

## STEP 2 — Structure des fichiers

src/  
├── components/  
│ ├── ToggleButton.tsx \# Bouton ON/OFF principal  
│ ├── StatusIndicator.tsx \# Indicateur d'état  
│ └── ThemeSelector.tsx \# Cases à cocher des thèmes  
├── services/  
│ ├── geolocation.ts \# Surveillance GPS  
│ ├── overpass.ts \# Requêtes OpenStreetMap  
│ ├── wikipedia.ts \# Récupération résumés Wikipedia  
│ ├── gemini.ts \# Agent Gemini (génération du message)  
│ └── tts.ts \# Text-to-Speech  
├── hooks/  
│ ├── useGeolocation.ts \# Hook GPS  
│ └── useRoadStories.ts \# Hook principal (orchestration)  
├── types/  
│ └── index.ts \# Types TypeScript partagés  
├── App.tsx  
└── main.tsx

---

## STEP 3 — Types TypeScript

**Prompt Copilot à utiliser dans `src/types/index.ts` :**  
// Crée les types TypeScript pour :  
// \- Coords : latitude et longitude (number)  
// \- POI : id (string), name (string), lat, lng, tags (Record\<string, string\>)  
// \- Theme : id (string), label (string), enabled (boolean)  
// \- AppStatus : 'idle' | 'active' | 'speaking'

---

## STEP 4 — Service Géolocalisation

**Fichier : `src/services/geolocation.ts`**

**Prompt Copilot :**  
// Service de géolocalisation avec :  
// \- watchPosition() : surveille la position GPS en continu  
// options : enableHighAccuracy: true, maximumAge: 10000  
// \- clearWatch() : arrête la surveillance  
// \- calculateDistance(coord1, coord2) : retourne la distance en mètres  
// utiliser la formule de Haversine  
// Exporter les fonctions individuellement (pas de classe)

---

## STEP 5 — Service Overpass API (OpenStreetMap)

**Fichier : `src/services/overpass.ts`**

⚠️ L'Overpass API ne supporte pas les requêtes GET depuis le navigateur. Utiliser impérativement une requête **POST** avec le body encodé.

**Prompt Copilot :**  
// Service pour interroger l'Overpass API OpenStreetMap  
// Endpoint : https://overpass-api.de/api/interpreter  
// Méthode : POST (obligatoire, GET retourne une erreur 406\)  
// Headers : Content-Type: application/x-www-form-urlencoded  
// Body : data={requête encodée avec encodeURIComponent}  
// Fonction getNearbyPOIs(lat: number, lng: number, radiusMeters: number \= 500\)  
// Retourne Promise\<POI\[\]\>  
// La requête Overpass doit chercher dans le rayon :  
// \- tourism=information avec information=guidepost  
// \- historic (toutes valeurs)  
// \- tourism=attraction  
// \- natural=peak ou natural=waterfall  
// Utiliser le format \[out:json\] et parser la réponse en tableau de POI  
// Chaque nœud OSM devient un POI avec id, name (tag name ou name:fr), lat, lng, tags  
// Exemple d'appel fetch :  
// const query \= \`\[out:json\];node\["tourism"="information"\](around:${radiusMeters},${lat},${lng});out;\`  
// fetch("https://overpass-api.de/api/interpreter", {  
//   method: "POST",  
//   headers: { "Content-Type": "application/x-www-form-urlencoded" },  
//   body: \`data=${encodeURIComponent(query)}\`  
// })

---

## STEP 6 — Service Wikipedia

**Fichier : `src/services/wikipedia.ts`**

**Prompt Copilot :**  
// Service Wikipedia REST API en français  
// URL : https://fr.wikipedia.org/api/rest\_v1/page/summary/{encodedTitle}  
// Fonction getWikipediaSummary(title: string): Promise\<string | null\>  
// \- Encoder le titre avec encodeURIComponent  
// \- Retourner le champ "extract" de la réponse  
// \- Retourner null si page non trouvée (404) ou erreur réseau  
// \- Timeout de 5 secondes

---

## STEP 7 — Service Text-to-Speech

**Fichier : `src/services/tts.ts`**

**Prompt Copilot :**  
// Service Text-to-Speech utilisant Web Speech API (SpeechSynthesis)  
// Fonction speak(text: string): Promise\<void\>  
// \- Utiliser window.speechSynthesis  
// \- Langue : fr-FR  
// \- Rate : 1.0, Pitch : 1.0  
// \- Résoudre la Promise quand la lecture est terminée (onend)  
// \- Rejeter la Promise en cas d'erreur (onerror)  
// Fonction stop(): void  
// \- Annuler la lecture en cours avec window.speechSynthesis.cancel()  
// Fonction isSpeaking(): boolean  
// \- Retourner window.speechSynthesis.speaking

---

##

## STEP 8 — Service Gemini (le cœur de l'agent)

**Fichier : `src/services/gemini.ts`**

C'est ici que l'agent prend vie. Il reçoit les données brutes et génère un message audio.

⚠️ Le package s'appelle désormais **`@google/genai`** (nouveau SDK officiel). L'ancien `@google/generative-ai` est déprécié.

**Prompt Copilot :**  
// Agent Gemini 2.5 Flash pour générer des messages audio touristiques  
// Importer { GoogleGenAI, Type } depuis @google/genai  
// Clé API : import.meta.env.VITE_GEMINI_API_KEY  
// Modèle : gemini-3.1-flash-lite  
// Initialisation :  
// const ai \= new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY })  
// Interface en paramètre :  
// GenerateMessageParams {  
// poiName: string  
// wikipediaSummary: string | null  
// enabledThemes: string\[\] // labels des thèmes cochés  
// }  
// Déclarer un outil Wikipedia pour que Gemini comprenne ce qu'il peut appeler :  
// {  
// functionDeclarations: \[{  
// name: 'getWikipediaSummary',  
// description: 'Récupère le résumé Wikipedia en français d'un lieu',  
// parameters: {  
// type: Type.OBJECT,  
// properties: {  
// title: { type: Type.STRING, description: 'Nom du lieu à rechercher' }  
// },  
// required: \['title'\]  
// }  
// }\]  
// }  
// Fonction generateRoadMessage(params: GenerateMessageParams): Promise\<string\>  
//  
// Appel avec ai.models.generateContent({  
// model: 'gemini-3.1-flash-lite',  
// contents: le prompt utilisateur,  
// config: { tools: \[outilWikipedia\], systemInstruction: le system prompt }  
// })  
//  
// System prompt :  
// "Tu es un guide de voyage sympa qui accompagne des automobilistes.  
// Génère un message audio de maximum 30 secondes (environ 60 mots).  
// Le message doit être naturel et oral, jamais encyclopédique.  
// Commence directement par une accroche sans dire bonjour.  
// Inclus une anecdote ou un fait marquant en lien avec : {enabledThemes}  
// Réponds uniquement avec le texte à lire à voix haute."  
//  
// User prompt :  
// "Lieu : {poiName}  
// Informations disponibles : {wikipediaSummary ?? 'Non disponible'}  
// Génère le message."  
//  
// Si response.functionCalls existe :  
// \- Exécuter getWikipediaSummary(appel.args.title)  
// \- Relancer generateContent avec le résultat pour obtenir le message final  
// Sinon :  
// \- Retourner response.text directement  
//  
// Après chaque appel, logger les tokens consommés via response.usageMetadata :  
// console.log(\`Tokens prompt : ${response.usageMetadata.promptTokenCount}\`)  
// console.log(\`Tokens réponse : ${response.usageMetadata.candidatesTokenCount}\`)  
// console.log(\`Total : ${response.usageMetadata.totalTokenCount}\`)

### 8.1 — Surveiller la consommation de tokens

Deux usages complémentaires fournis par le SDK :

**Après chaque appel** — `response.usageMetadata` retourne la consommation réelle :  
const response \= await ai.models.generateContent({ ... })  
const meta \= response.usageMetadata  
console.log(\`Prompt : ${meta.promptTokenCount} tokens\`)  
console.log(\`Réponse : ${meta.candidatesTokenCount} tokens\`)  
console.log(\`Total : ${meta.totalTokenCount} tokens\`)

**En amont** — `countTokens` pour estimer avant d'envoyer (utile pour les gros contextes) :  
const resultat \= await ai.models.countTokens({  
 model: 'gemini-3.1-flash-lite',  
 contents: texteATester,  
})  
console.log(\`${resultat.totalTokens} tokens\`)

💡 Pour Road Stories, logger `usageMetadata` en mode dev suffit. Un message Wikipedia \+ prompt génère typiquement **200 à 500 tokens** par POI, soit \~3 000 tokens pour un trajet Lyon → La Seyne — très loin des limites du free tier.

---

##

## STEP 9 — Hook useGeolocation

**Fichier : `src/hooks/useGeolocation.ts`**

**Prompt Copilot :**  
// Hook React useGeolocation()  
// State : coords (Coords | null), error (string | null)  
// \- Lance watchPosition au mount  
// \- Met à jour coords à chaque changement de position  
// \- Nettoie le watcher au unmount  
// Retourne : { coords, error }

---

## STEP 10 — Hook useRoadStories (orchestration principale)

**Fichier : `src/hooks/useRoadStories.ts`**

C'est le cerveau de l'app. Il orchestre GPS → POI → Agent → Audio.

**Prompt Copilot :**  
// Hook useRoadStories() — orchestration principale  
// Props : themes (Theme\[\])  
// State :  
// \- isActive (boolean) : app ON/OFF  
// \- status (AppStatus) : 'idle' | 'active' | 'speaking'  
// \- currentPOIName (string | null) : nom du lieu en cours de lecture  
// \- triggeredPOIs (Set\<string\>) : ids des POIs déjà déclenchés  
// Logique :  
// 1\. Utiliser useGeolocation pour la position GPS  
// 2\. Quand isActive est true, lancer un setInterval toutes les 30 secondes  
// 3\. À chaque tick :  
// a. Appeler getNearbyPOIs(coords.lat, coords.lng, 500\)  
// b. Filtrer les POIs dont l'id n'est pas dans triggeredPOIs  
// c. Si un POI trouvé et status \!== 'speaking' :  
// \- Ajouter son id dans triggeredPOIs  
// \- Passer status à 'speaking'  
// \- Appeler getWikipediaSummary avec le nom du POI  
// \- Appeler generateRoadMessage avec nom, résumé, thèmes actifs  
// \- Appeler speak() avec le message généré  
// \- Repasser status à 'active' quand speak() se termine  
// 4\. Nettoyer l'interval quand isActive passe à false ou au unmount  
// Retourne : { isActive, setIsActive, status, currentPOIName }

---

##

## STEP 11 — Composants UI

### ToggleButton.tsx

**Prompt Copilot :**  
// Composant ToggleButton  
// Props : isActive (boolean), onToggle (() \=\> void), disabled (boolean)  
// Grand bouton rond central  
// isActive=true : fond vert, texte "ON"  
// isActive=false : fond gris, texte "OFF"  
// Animation de pulse quand isActive=true (Tailwind animate-pulse)

### StatusIndicator.tsx

**Prompt Copilot :**  
// Composant StatusIndicator  
// Props : status (AppStatus), currentPOIName (string | null)  
// idle : "En attente..."  
// active : "En écoute 🎧"  
// speaking : "♪ {currentPOIName}" avec animation

### ThemeSelector.tsx

**Prompt Copilot :**  
// Composant ThemeSelector  
// Props : themes (Theme\[\]), onToggle ((id: string) \=\> void)  
// Liste de cases à cocher stylées Tailwind  
// Thèmes par défaut :  
// \- monuments-historiques : "Monuments historiques"  
// \- histoire-villes : "Histoire des villes"  
// \- curiosites-naturelles : "Curiosités naturelles"  
// \- anecdotes : "Anecdotes insolites"  
// \- gastronomie : "Gastronomie locale"  
// \- personnages : "Personnages célèbres"

---

## STEP 12 — App.tsx

**Prompt Copilot :**  
// App principale Road Stories  
// State : themes (Theme\[\]) initialisé avec les 6 thèmes (tous enabled par défaut)  
// Utiliser useRoadStories(themes)  
// Layout centré, fond sombre  
// Ordre vertical :  
// 1\. Titre "Road Stories"  
// 2\. StatusIndicator  
// 3\. ToggleButton (grand, centré)  
// 4\. ThemeSelector (en bas, scrollable)

---

## STEP 13 — Test et débogage

### Tester sans rouler

Pendant le développement, simuler une position GPS fixe dans `useGeolocation.ts` :

// MODE DEV : position fixe près d'un monument connu  
// Exemple : près du Pont du Gard (30210 Vers-Pont-du-Gard)  
const DEV_COORDS \= { lat: 43.9467, lng: 4.5353 }

### Vérifier les données OSM

Utiliser **Overpass Turbo** (le navigateur ne supporte pas les requêtes GET vers l'API) : 👉 [https://overpass-turbo.eu](https://overpass-turbo.eu)

Coller cette requête et cliquer sur **Run** :

\[out:json\];  
node\["tourism"="information"\]  
 (around:2000, 43.9467, 4.5353);  
out;

Les résultats s'affichent sur la carte et en JSON dans l'onglet Data.

### Checklist de test

- [ ] GPS retourne une position
- [ ] Overpass retourne des POIs sur une zone connue
- [ ] Wikipedia retourne un résumé pour un lieu connu
- [ ] Gemini génère un message cohérent
- [ ] La voix se déclenche et se termine proprement
- [ ] Anti-doublon fonctionne (même POI pas rejoué)

---

##

## STEP 14 — Limitations à garder en tête

| Problème              | Cause                                  | Solution v0                        |
| :-------------------- | :------------------------------------- | :--------------------------------- |
| Pas de POIs retournés | Données OSM insuffisantes dans la zone | Élargir le rayon à 2000m en dev    |
| Voix robotique        | Web Speech API limitée                 | Acceptable pour v0                 |
| App se met en veille  | Mobile coupe le GPS en arrière-plan    | Ajouter Wake Lock API              |
| iOS arrière-plan      | PWA limitée sur Safari                 | Documenter comme limitation connue |

### Wake Lock API (optionnel mais recommandé)

// Dans useRoadStories, quand isActive passe à true :  
const wakeLock \= await navigator.wakeLock.request('screen')  
// Relâcher quand isActive passe à false :  
await wakeLock.release()

---

## Ordre de développement recommandé

1. ✅ Setup projet \+ variables d'environnement
2. ✅ Types TypeScript
3. ✅ Service Wikipédia (le plus simple à tester)
4. ✅ Service Gemini (tester avec un texte Wikipedia hardcodé)
5. ✅ Service TTS (tester avec un texte hardcodé)
6. ✅ Service Overpass (tester avec coordonnées fixes)
7. ✅ Service Geolocation
8. ✅ Hook useRoadStories avec coordonnées fixes en dev
9. ✅ Composants UI
10. ✅ Test sur mobile avec vrai GPS
