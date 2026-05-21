# Road Stories — Intégration Google Places API (Agent)

Ajout de 3 outils agentiques : note/avis, horaires, tarifs, adresse

---

## Etat actuel (baseline avant Places)

L'application est deja refactoree pour accueillir de nouveaux tools agentiques, sans ajout Places actif pour le moment.

Ce qui est deja en place :

- Le hook n'appelle plus Wikipedia directement : Gemini decide des appels outils.
- Le flux Gemini gere les function calls en parallele via `Promise.all`.
- Le second tour `generateContent` est fait sans `tools`.
- Le contrat de message ne depend plus de `wikipediaSummary`.
- Le registre de tools front existe deja dans `src/services/agentTools.ts`.
- Le serveur Gemini accepte deja un schema multi-tools.

Objectif de ce document : ajouter Google Places par-dessus cette baseline, sans reintroduire de couplage dans `useRoadStories`.

---

## Objectif

Transformer Road Stories en vrai agent : Gemini décide **seul** quand et pourquoi appeler Google Places selon le POI détecté. Un château médiéval peu connu n'a pas besoin d'avis Google. Un musée ouvert dans 30 minutes, si.

**Avant :** POI détecté → Wikipedia → Gemini génère  
**Après :** POI détecté → Gemini décide :  
 → getWikipediaSummary() si besoin de contexte historique  
 → getPlaceDetails() si POI visitable avec horaires/avis/tarifs  
 → Gemini synthétise tout et génère le message audio

---

## Prérequis

### Google Cloud Console

1. Aller sur [**https://console.cloud.google.com**](https://console.cloud.google.com)
2. Créer un nouveau projet : `road-stories-places`
3. Activer la facturation (CB requise — 200$/mois offerts)
4. Activer **"Places API (New)"** — pas l'ancienne version
5. Créer une clé API serveur :
   - **API restrictions** : autoriser uniquement **Places API (New)**
   - **Application restrictions** : ne pas utiliser HTTP referrers pour cette clé (clé utilisée côté serveur)
   - Optionnel : restreindre par IP uniquement si vous disposez d'IPs de sortie fixes

### Variable d'environnement Vercel (côté serveur)

Dans **Vercel Dashboard → Settings → Environment Variables** :

GOOGLE_PLACES_API_KEY \= ta_clé_ici

⚠️ Pas de préfixe `VITE_` — cette clé ne doit jamais aller dans le bundle frontend. Ne jamais la committer dans le code.

---

## Règle de facturation

L'approche **Text Search en une seule requête** est la plus simple et suffisante pour Road Stories :

| SKU                  | Coût                | Volume gratuit/mois |
| :------------------- | :------------------ | :------------------ |
| Text Search Advanced | \~29$/1000 requêtes | \~6 800 requêtes    |

Pour Road Stories : \~15 requêtes par trajet Lyon → La Seyne. Aucun risque de dépassement.

⚠️ Ne JAMAIS utiliser `X-Goog-FieldMask: places.*` — ça facture tous les champs. Lister uniquement les champs nécessaires dans le FieldMask.

**FieldMask exact à utiliser :**

places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.reviews,places.formattedAddress,places.types,places.googleMapsUri,places.websiteUri

---

## Architecture

useRoadStories (tick)  
 ↓  
generateRoadMessage (gemini.ts)  
 ↓ Gemini décide quels outils appeler :  
 ├── getWikipediaSummary (existant — inchangé)  
 └── getPlaceDetails (nouveau)  
 ↓ Registre des outils serveur (api/tools/index.ts)  
 └── getPlaceDetails -> appelle le proxy /api/places  
 ↓  
 GET /api/places?name=...&lat=...&lng=... (proxy Vercel Edge Function)  
 ↓  
 Google Places API — Text Search (New)

      Une seule requête : nom \+ locationRestriction rectangle (~1500m) → rating \+ hours \+ reviews \+ address

---

## Fichiers à créer / modifier

api/  
└── places.ts ← NOUVEAU : proxy Vercel serverless  
api/tools/  
├── places.ts ← NOUVEAU : tool serveur getPlaceDetails (utilisé par api/gemini.ts)  
└── index.ts ← MODIFIER : enregistrer le tool places dans TOOLS  
src/services/  
├── places.ts ← NOUVEAU : appel au proxy \+ types  
├── agentTools.ts ← MODIFIER : ajouter getPlaceDetails dans le registre  
└── gemini.ts ← MODIFIER : brancher la policy d'usage Places dans le prompt  
src/hooks/  
└── useRoadStories.ts ← DEJA PRET (pas de changement requis pour Places)  
.github/  
└── copilot-instructions.md ← MODIFIER : documenter le nouvel outil

---

## STEP 1 — Proxy Vercel Edge Function

**Fichier : `api/places.ts`** (à la racine du projet, pas dans `src/`)  
Une seule requête Text Search qui retourne toutes les données nécessaires en une fois.  
ℹ️ Utiliser le style Edge (`Request` / `Response`) pour rester cohérent avec les autres routes API.

**Prompt Copilot :**

```text
Fichier : api/places.ts (à la racine, pas dans src/)
Configuration Edge : Exporter `export const config = { runtime: 'edge' };`

Ce proxy Edge accepte une requête HTTP GET.
Signature de la fonction par défaut : export default async function handler(req: Request): Promise<Response>

EXTRACTION DES DONNÉES

- Vérifier si la méthode est bien GET, sinon retourner new Response("Method not allowed", { status: 405 })
- Récupérer les query params depuis l'URL : name, lat, lng
- Valider les query params :
   - name non vide
   - lat et lng numériques
   - sinon retourner 400 avec un message d'erreur JSON

CACHE CDN VERCEL (Spécificité Edge)

- Supprimer toute logique de Map JavaScript côté fonction.
- Utiliser le cache CDN Vercel via l'en-tête de réponse :
   Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600
- Le cache est alors géré automatiquement au niveau CDN sur l'URL GET complète.

REQUÊTE UNIQUE — Text Search (New)

- POST https://places.googleapis.com/v1/places:searchText
- Headers :
   Content-Type : application/json
   X-Goog-Api-Key : process.env.GOOGLE_PLACES_API_KEY
   X-Goog-FieldMask : places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.reviews,places.formattedAddress,places.types,places.googleMapsUri,places.websiteUri
- Body JSON :
   {
   textQuery: name,
   locationRestriction: {
   rectangle: {
   low: { latitude: lat - latDelta, longitude: lng - lngDelta },
   high: { latitude: lat + latDelta, longitude: lng + lngDelta }
   }
   },
   maxResultCount: 1,
   languageCode: "fr"
   }

- Calcul des deltas pour le rectangle (~1500m) :
  latDelta = 1500 / 111320
  lngDelta = 1500 / (111320 * cos(lat * PI / 180))

- Si data.places est vide ou absent → return new Response(JSON.stringify({ error: "Place not found" }), { status: 404, headers: { 'Content-Type': 'application/json' } })

FORMATER en PlaceResult :
{
rating: number | null,
userRatingCount: number | null,
isOpenNow: boolean | null,
todayHours: string | null, // Extraire depuis weekdayDescriptions en se basant sur le jour FR actuel (Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris" }))
priceLevel: string | null,
topReview: string | null, // Premier avis en "fr", tronqué à 200 caractères
address: string | null,
types: string[] | null,
googleMapsUri: string | null,
websiteUri: string | null
}

RÉPONSE RETOURNÉE

- Retourner la réponse au format standard Web API :
   return new Response(JSON.stringify(result), {
   status: 200,
   headers: {
     'Content-Type': 'application/json',
     'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600'
   }
   })

Gestion d'erreurs : try/catch global → return new Response(JSON.stringify({ error: message }), { status: 502, headers: { 'Content-Type': 'application/json' } })

En cas d'erreur Google, inclure le détail de la réponse HTTP dans le message pour faciliter le debug des 400.
```

---

## STEP 2 — Service places.ts

**Fichier : `src/services/places.ts`**

**Prompt Copilot :**

```text
Toujours appeler /api/places — jamais directement l'API Google
Exporter l'interface PlaceResult (utilisée aussi dans gemini.ts) :
{
rating: number | null
userRatingCount: number | null
isOpenNow: boolean | null
todayHours: string | null
priceLevel: string | null
topReview: string | null
address: string | null
types: string[] | null,
googleMapsUri: string | null,
websiteUri: string | null,
}
Exporter la fonction formatPriceLevel(priceLevel: string | null): string | null
"PRICE_LEVEL_FREE" → "Entrée gratuite"
"PRICE_LEVEL_INEXPENSIVE" → "Peu coûteux"
"PRICE_LEVEL_MODERATE" → "Prix modérés"
"PRICE_LEVEL_EXPENSIVE" → "Entrée payante"
"PRICE_LEVEL_VERY_EXPENSIVE" → "Entrée très coûteuse"
null ou inconnu → null
Exporter la fonction getPlaceDetails(name, lat, lng): Promise<PlaceResult | null>
- GET /api/places?name=<name>&lat=<lat>&lng=<lng>
- Timeout 8 secondes via AbortController
- Si réponse 404 → retourner null (lieu non trouvé, comportement normal)
- Si erreur réseau ou AbortError → retourner null
- Si autre erreur HTTP (500, 502) → logger l'erreur et retourner null
(ne pas propager — un échec Places ne doit pas bloquer la génération du message)
- Logger le résultat : logger.debug("places", result)
```

---

## STEP 3 — Mise à jour de gemini.ts

> Note : la boucle multi-tools (`Promise.all`) est deja en place dans la baseline actuelle.
> L'ajout Places doit s'appuyer dessus, pas la reimplementer.
> Important : côté serveur, `api/gemini.ts` exécute les tools via `api/tools/index.ts`.
> Donc l'intégration Places nécessite aussi un tool serveur dédié (`api/tools/places.ts`).

### 3.1 Déclarer placesTool

**Prompt Copilot :**

```text

Dans gemini.ts, ajouter placesTool après wikipediaTool :
{
functionDeclarations: \[{
name: "getPlaceDetails",
description: "Récupère depuis Google Places la note moyenne, le nombre d'avis,
les horaires d'ouverture du jour, l'adresse exacte et le niveau de prix d'un lieu.
Appeler uniquement pour les lieux visitables par le public :
musées, châteaux, sites archéologiques, parcs naturels aménagés,
monuments avec billetterie, attractions touristiques.
Ne PAS appeler pour : cols, rivières, forêts sans aménagement,
éléments géographiques naturels sans infrastructure d'accueil.",
parameters: {
type: Type.OBJECT,
properties: {
name: { type: Type.STRING, description: "Nom exact du lieu tel qu'il apparaît sur OSM" },
lat: { type: Type.NUMBER, description: "Latitude du lieu" },
lng: { type: Type.NUMBER, description: "Longitude du lieu" }
},
required: \["name", "lat", "lng"\]
}
}\]
}
```

### 3.2 Mettre à jour handleFunctionCall

**Prompt Copilot :**

```text

Modifier handleFunctionCall pour retourner une string (résultat brut de l'outil)
sans relancer generateContent — c'est generateRoadMessage qui gère la boucle.

La fonction devient :
async function handleFunctionCall(call: FunctionCall): Promise\<string\>

Si call.name \=== "getWikipediaSummary" :
- Extraire title depuis call.args
- Appeler getWikipediaSummary(title)
- Retourner le résumé ou "Non disponible"

Si call.name \=== "getPlaceDetails" :
- Extraire name, lat, lng depuis call.args (Convertir explicitement lat et lng via Number(call.args.lat) et Number(call.args.lng) pour garantir le type numérique)
- Appeler getPlaceDetails(name, lat, lng) depuis services/places.ts
- Si null → retourner "Informations Google Places non disponibles pour ce lieu"
- Sinon formater en texte lisible pour Gemini :
`Nom: ${name}
Adresse: ${address ?? "non disponible"}
Note: ${rating}/5 (${userRatingCount} avis)
Ouvert maintenant: ${isOpenNow ? "oui" : "non"}
Horaires aujourd'hui: ${todayHours ?? "non disponibles"}
Tarifs: ${formatPriceLevel(priceLevel) ?? "non renseignés"}
Extrait d'un avis: ${topReview ?? "aucun avis disponible"}`
- Retourner ce texte

Si call.name inconnu → retourner "Outil inconnu"
```

### 3.3 Gérer les appels parallèles avec Promise.all

Etat : deja implemente.

Action attendue pour Places : verifier que la structure actuelle continue de fonctionner quand `getPlaceDetails` est ajoute au registre (front et serveur).

**Prompt Copilot :**

```text
Dans generateRoadMessage, remplacer la logique de function call existante :

Après le premier appel generateWithRetry :

CAS 1 — Aucun functionCall → retourner response.text ?? "" directement

CAS 2 — Un ou plusieurs functionCalls :
const calls = response.functionCalls // FunctionCall[]

Exécuter tous les outils en parallèle
const toolResults = await Promise.all(calls.map(call => handleFunctionCall(call)))

Logger
logger.debug("gemini", `${calls.length} outil(s) appelé(s) :`, calls.map(c => c.name))

Construire l'historique complet
const contents: Content[] = [
   { role: "user", parts: [{ text: userPrompt }] },
   { role: "model", parts: calls.map(c => ({ functionCall: c })) },
   {
      role: "user",
      parts: calls.map((c, i) => ({
         functionResponse: {
            name: c.name,
            response: { output: toolResults[i] }
         }
      }))
   }
]

Relancer UNE SEULE FOIS avec tout l'historique
const finalResponse = await generateWithRetry({
   model: GEMINI_MODEL,
   contents,
   config: { systemInstruction: systemPrompt }
   // Pas de tools ici — Gemini ne doit plus appeler d'outils dans ce second tour
})

logTokens(finalResponse)
return finalResponse.text ?? ""
```

### 3.4 Mettre à jour buildSystemPrompt et buildUserPrompt

**Prompt Copilot :**

```text
Mettre à jour buildSystemPrompt dans gemini.ts :

Remplacer la section outils par :
"Tu disposes de deux outils pour enrichir ton message :

getWikipediaSummary(title) :
Utilise-le pour les lieux historiques, monuments, sites naturels remarquables,
personnages célèbres associés à un lieu. Donne accès au contexte encyclopédique.

getPlaceDetails(name, lat, lng) :
Utilise-le pour les lieux visitables par le public (musées, châteaux, sites avec
billetterie, parcs aménagés). Donne accès à l'adresse exacte, la note Google, les horaires du jour,
les tarifs et un extrait d'avis client.
Ne pas appeler pour des éléments géographiques naturels sans infrastructure.

Tu peux appeler les deux si c'est pertinent (ex: château historique visitable).
Si les horaires indiquent une fermeture dans moins d'une heure, mentionne-le.
Ne mentionne jamais les outils dans ta réponse finale.
Si un outil retourne 'Non disponible', ignore-le et génère quand même le message."

Mettre à jour buildUserPrompt :
Supprimer le paramètre wikipediaSummary — Gemini l'appellera lui-même
Nouvelle signature : buildUserPrompt(poiName, coords, poiTags)
Nouveau contenu :
`Lieu : ${poiName}
Coordonnées GPS : ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}
Tags OSM : ${relevantTags || "aucun"}
Génère le message audio.`

Mettre à jour l'interface GenerateMessageParams :
Supprimer wikipediaSummary
{ poiName, coords, poiTags, enabledThemes }

Dans generateRoadMessage :
Toujours passer les deux outils :
config: { tools: [wikipediaTool, placesTool], systemInstruction: systemPrompt }
```

---

## STEP 4 — Simplifier useRoadStories.ts

Etat : deja implemente.

`useRoadStories` ne doit pas etre recouple aux details Places ni Wikipedia.

**Prompt Copilot :**

```text
Dans useRoadStories.ts, dans la fonction tick() :

Supprimer ces lignes :
const wikiTag = newPOI.tags["wikipedia"]
const wikiTitle = wikiTag ? wikiTag.replace(/^\\w{2}:/, "") : newPOI.name
const wikipediaSummary = await getWikipediaSummary(wikiTitle)

Gemini appelle Wikipedia lui-même via tool use — plus besoin de le faire ici.

Simplifier l'appel à generateRoadMessage :
const message = await generateRoadMessage({
poiName: newPOI.name,
coords: { lat: newPOI.lat, lng: newPOI.lng },
poiTags: newPOI.tags,
enabledThemes,
})

Supprimer l'import de getWikipediaSummary dans ce fichier
```

---

## STEP 5 — Mettre à jour copilot-instructions.md

Ajouter cette section dans `.github/copilot-instructions.md` :

## Google Places API

**Proxy** : toujours appeler /api/places — jamais l'API Google directement depuis le frontend  
**Clé API** : process.env.GOOGLE_PLACES_API_KEY côté serveur uniquement (api/places.ts)  
**FieldMask** : ne jamais utiliser places.\* — toujours lister les champs exactement

### Facturation

- SKU : Text Search Advanced (~29$/1000 requêtes, ~6 800 requêtes gratuites/mois)
- Cache 24h basé sur le nom et la position géolocalisée (`${name}_${lat.toFixed(2)}_${lng.toFixed(2)}`) pour éviter les appels répétés ou collisions sur le même POI.
- FieldMask exact : places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.reviews,places.formattedAddress,places.types,places.googleMapsUri,places.websiteUri

### PlaceResult (src/services/places.ts)

{  
 rating: number | null  
 userRatingCount: number | null  
 isOpenNow: boolean | null  
 todayHours: string | null  
 priceLevel: string | null  
 topReview: string | null  
 address: string | null  
 types: string[] | null
googleMapsUri: string | null
websiteUri: string | null
}

### Outils Gemini

| Outil               | Quand Gemini l'appelle                                      |
| ------------------- | ----------------------------------------------------------- |
| getWikipediaSummary | Lieux historiques, monuments, géographie remarquable        |
| getPlaceDetails     | Lieux visitables : musées, châteaux, sites avec billetterie |

Gemini peut appeler les deux dans le même tour.

Gérer avec Promise.all — relancer generateContent UNE seule fois avec tout l'historique.

Ne pas passer tools au second appel generateContent.

---

## STEP 6 — Test et débogage

### Installer Vercel CLI pour tester en local

npm install \-D vercel

Créer `.vercel/.env.local` ou utiliser `npx vercel env pull` pour récupérer les variables.

Lancer :

npx vercel dev

### Tester le proxy avec curl

curl "http://localhost:3000/api/places?name=Pont%20du%20Gard&lat=43.9467&lng=4.5353"

Réponse attendue :

{  
 "rating": 4.8,  
 "userRatingCount": 42580,  
 "isOpenNow": true,  
 "todayHours": "Lundi: 09:00 – 21:00",  
 "priceLevel": "PRICE_LEVEL_MODERATE",  
 "topReview": "Site exceptionnel, à couper le souffle...",  
 "address": "400 Rte du Pont du Gard, 30210 Vers-Pont-du-Gard, France"  
}

### Tester le cache

# Deuxième appel identique (même URL GET) → réponse servie par le cache CDN

curl "http://localhost:3000/api/places?name=Pont%20du%20Gard&lat=43.9467&lng=4.5353"

### Checklist de test

- [ ] Proxy retourne un résultat pour "Pont du Gard"
- [ ] Proxy retourne 404 pour un nom inventé
- [ ] Deuxième appel identique → retour immédiat (cache)
- [ ] `getPlaceDetails` dans places.ts retourne un `PlaceResult`
- [ ] `getPlaceDetails` retourne `null` sur 404 sans planter
- [ ] Gemini appelle `getPlaceDetails` pour le Musée d'Orsay
- [ ] Gemini n'appelle PAS `getPlaceDetails` pour le Col du Galibier
- [ ] Gemini appelle les deux outils pour le Château de Pierrefonds
- [ ] `Promise.all` s'exécute bien en parallèle (vérifier les logs)
- [ ] Le second appel `generateContent` ne reçoit pas de `tools`
- [ ] Message final cohérent avec les données Places
- [ ] Tokens loggés : viser \< 1000 tokens/POI avec les deux outils

### Exemples de messages attendus

**Musée (un seul outil — Places) :**

_"Le Musée d'Orsay est à deux kilomètres, situé au 1 Rue de la Légion d'Honneur. Noté 4,7 sur 5 par plus de 65 000 visiteurs. Ouvert jusqu'à 21h45 ce soir, entrée à tarif modéré."_

**Monument historique visitable (deux outils) :**

_"Le Château de Pierrefonds est à votre gauche — forteresse médiévale restaurée par Viollet-le-Duc au XIXe siècle. Noté 4,6 sur 5\. Ouvert jusqu'à 18h aujourd'hui."_

**Site naturel (un seul outil — Wikipedia) :**

_"Vous passez au pied du Mont Ventoux, le géant de Provence. Culminant à 1 909 mètres, il est célèbre pour ses étapes mythiques du Tour de France depuis 1951."_

---

## Ce que ça change sur l'agentique

| Avant                                          | Après                                 |
| :--------------------------------------------- | :------------------------------------ |
| Gemini génère depuis données fixes             | Gemini décide quels outils appeler    |
| Wikipédia appelé systématiquement dans le hook | Gemini appelle Wikipedia si pertinent |
| Pas d'avis ni horaires                         | Note, horaires, tarifs, adresses      |
| 1 outil déclaré                                | 2 outils, appels parallèles possibles |
| Boucle fixe dans useRoadStories                | Boucle de décision dans Gemini        |

---

## Ordre de développement recommandé

- [x] Configurer Google Cloud \+ activer Places API (New)
- [x] Ajouter `GOOGLE_PLACES_API_KEY` dans Vercel Dashboard (sans préfixe VITE\_)
- [ ] Créer `api/places.ts` — proxy avec cache \+ Text Search
- [ ] Tester le proxy : `npx vercel dev` \+ curl Pont du Gard
- [ ] Tester le cache : deuxième appel identique → réponse immédiate
- [ ] Créer `src/services/places.ts` — getPlaceDetails \+ formatPriceLevel
- [ ] Ajouter `placesTool` dans `agentTools.ts` / registre serveur (STEP 3.1 adapte)
- [ ] Mapper `getPlaceDetails` dans l'execution tool (STEP 3.2)
- [ ] Valider le flux parallele existant (STEP 3.3 deja en place)
- [ ] Mettre à jour system prompt \+ user prompt (STEP 3.4)
- [ ] Conserver `useRoadStories` decouple (STEP 4 deja en place)
- [ ] Tester sur Pont du Gard en DEV_COORDS
- [ ] Tester sur Col du Galibier — Gemini ne doit pas appeler Places
- [ ] Vérifier dans Google Cloud Console que les requêtes apparaissent
- [ ] Déployer sur Vercel et vérifier que le proxy fonctionne en production
