# Road Stories — Intégration Google Places API (Agent)

Ajout de 3 outils agentiques : note/avis, horaires, tarifs

---

## Objectif

Transformer Road Stories en vrai agent : Gemini décide **seul** quand et pourquoi appeler Google Places selon le POI détecté. Un château médiéval peu connu n'a pas besoin d'avis Google. Un musée ouvert dans 30 minutes, si.

**Avant :**  
POI détecté → Wikipedia → Gemini génère  
**Après :**  
POI détecté → Gemini décide :  
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
5. Créer une clé API → restreindre aux **HTTP referrers** :
   - `https://road-stories-gamma.vercel.app/*`
   - `http://localhost:5173/*`

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

places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.reviews

---

## Architecture

useRoadStories (tick)  
 ↓  
generateRoadMessage (gemini.ts)  
 ↓ Gemini décide quels outils appeler :  
 ├── getWikipediaSummary (existant — inchangé)  
 └── getPlaceDetails (nouveau)  
 ↓  
 POST /api/places (proxy Vercel serverless)  
 ↓  
 Google Places API — Text Search (New)

        Une seule requête : nom \+ locationBias 500m → rating \+ hours \+ reviews

---

## Fichiers à créer / modifier

api/  
└── places.ts ← NOUVEAU : proxy Vercel serverless  
src/services/  
├── places.ts ← NOUVEAU : appel au proxy \+ types  
└── gemini.ts ← MODIFIER : ajouter placesTool \+ Promise.all  
src/hooks/  
└── useRoadStories.ts ← MODIFIER : supprimer appel Wikipedia direct  
.github/  
└── copilot-instructions.md ← MODIFIER : documenter le nouvel outil

---

## STEP 1 — Proxy Vercel serverless

**Fichier : `api/places.ts`** (à la racine du projet, pas dans `src/`)  
Une seule requête Text Search qui retourne toutes les données nécessaires en une fois.  
ℹ️ `@vercel/node` est déjà installé.

**Prompt Copilot :**  
// Proxy Vercel serverless pour Google Places API (New) — Text Search  
// Fichier : api/places.ts (à la racine, pas dans src/)  
// Import : VercelRequest, VercelResponse depuis @vercel/node  
// Ce proxy accepte une requête POST avec body JSON :  
// { name: string, lat: number, lng: number }  
// CACHE EN MÉMOIRE  
// Map JavaScript avec TTL de 24h  
// Clé : \`${name.toLowerCase().trim()}\`  
// Valeur : { result: PlaceResult, cachedAt: number }  
// Si résultat en cache et âge \< 24h → retourner directement sans appel API  
// Évite de payer plusieurs fois pour le même POI  
// REQUÊTE UNIQUE — Text Search (New)  
// POST https://places.googleapis.com/v1/places:searchText  
// Headers :  
// Content-Type : application/json  
// X-Goog-Api-Key : process.env.GOOGLE_PLACES_API_KEY  
// X-Goog-FieldMask : places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.reviews  
// ⚠️ Ne JAMAIS utiliser places.\* dans le FieldMask  
// Body JSON :  
// {  
// textQuery: name,  
// locationBias: {  
// circle: {  
// center: { latitude: lat, longitude: lng },  
// radius: 500.0 ← correspond au rayon de détection OSM  
// }  
// },  
// maxResultCount: 1,  
// languageCode: "fr"  
// }  
// Si data.places est vide ou absent → retourner 404 { error: "Place not found" }  
// FORMATER en PlaceResult :  
// {  
// rating: number | null, // places\[0\].rating  
// userRatingCount: number | null, // places\[0\].userRatingCount  
// isOpenNow: boolean | null, // places\[0\].currentOpeningHours?.openNow ?? null  
// todayHours: string | null, // places\[0\].currentOpeningHours?.weekdayDescriptions  
// // \[index du jour actuel\]  
// // Calcul index : (new Date().getDay() \+ 6\) % 7  
// // (Google : 0=lundi ... 6=dimanche)  
// priceLevel: string | null, // places\[0\].priceLevel ?? null  
// topReview: string | null // Chercher dans places\[0\].reviews le premier avis  
// // dont languageCode \=== "fr", sinon prendre reviews\[0\]  
// // Retourner review.text.text tronqué à 200 caractères  
// }  
// Stocker dans le cache puis retourner avec res.status(200).json(result)  
// Gestion d'erreurs : try/catch global → res.status(502).json({ error: message })

---

## STEP 2 — Service places.ts

**Fichier : `src/services/places.ts`**

**Prompt Copilot :**  
// Service Google Places pour Road Stories  
// Toujours appeler /api/places — jamais directement l'API Google  
// Exporter l'interface PlaceResult (utilisée aussi dans gemini.ts) :  
// {  
// rating: number | null  
// userRatingCount: number | null  
// isOpenNow: boolean | null  
// todayHours: string | null  
// priceLevel: string | null  
// topReview: string | null  
// }  
// Exporter la fonction formatPriceLevel(priceLevel: string | null): string | null  
// "PRICE_LEVEL_FREE" → "Entrée gratuite"  
// "PRICE_LEVEL_INEXPENSIVE" → "Peu coûteux"  
// "PRICE_LEVEL_MODERATE" → "Prix modérés"  
// "PRICE_LEVEL_EXPENSIVE" → "Entrée payante"  
// "PRICE_LEVEL_VERY_EXPENSIVE" → "Entrée très coûteuse"  
// null ou inconnu → null  
// Exporter la fonction getPlaceDetails(name, lat, lng): Promise\<PlaceResult | null\>  
// \- POST /api/places avec body JSON { name, lat, lng }  
// \- Headers : Content-Type application/json  
// \- Timeout 8 secondes via AbortController  
// \- Si réponse 404 → retourner null (lieu non trouvé, comportement normal)  
// \- Si erreur réseau ou AbortError → retourner null  
// \- Si autre erreur HTTP (500, 502\) → logger l'erreur et retourner null  
// (ne pas propager — un échec Places ne doit pas bloquer la génération du message)  
// \- Logger le résultat : logger.debug("places", result)

---

## STEP 3 — Mise à jour de gemini.ts

### 3.1 Déclarer placesTool

**Prompt Copilot :**

// Dans gemini.ts, ajouter placesTool après wikipediaTool :  
// {  
// functionDeclarations: \[{  
// name: "getPlaceDetails",  
// description: "Récupère depuis Google Places la note moyenne, le nombre d'avis,  
// les horaires d'ouverture du jour et le niveau de prix d'un lieu.  
// Appeler uniquement pour les lieux visitables par le public :  
// musées, châteaux, sites archéologiques, parcs naturels aménagés,  
// monuments avec billetterie, attractions touristiques.  
// Ne PAS appeler pour : cols, rivières, forêts sans aménagement,  
// éléments géographiques naturels sans infrastructure d'accueil.",  
// parameters: {  
// type: Type.OBJECT,  
// properties: {  
// name: { type: Type.STRING, description: "Nom exact du lieu tel qu'il apparaît sur OSM" },  
// lat: { type: Type.NUMBER, description: "Latitude du lieu" },  
// lng: { type: Type.NUMBER, description: "Longitude du lieu" }  
// },  
// required: \["name", "lat", "lng"\]  
// }  
// }\]  
// }

### 3.2 Mettre à jour handleFunctionCall

**Prompt Copilot :**

// Modifier handleFunctionCall pour retourner une string (résultat brut de l'outil)  
// sans relancer generateContent — c'est generateRoadMessage qui gère la boucle.  
//  
// La fonction devient :  
// async function handleFunctionCall(call: FunctionCall): Promise\<string\>  
//  
// Si call.name \=== "getWikipediaSummary" :  
// \- Extraire title depuis call.args  
// \- Appeler getWikipediaSummary(title)  
// \- Retourner le résumé ou "Non disponible"  
//  
// Si call.name \=== "getPlaceDetails" :  
// \- Extraire name, lat, lng depuis call.args (castés en Record\<string, unknown\>)  
// \- Appeler getPlaceDetails(name, lat, lng) depuis services/places.ts  
// \- Si null → retourner "Informations Google Places non disponibles pour ce lieu"  
// \- Sinon formater en texte lisible pour Gemini :  
// \`Note: ${rating}/5 (${userRatingCount} avis)  
// Ouvert maintenant: ${isOpenNow ? "oui" : "non"}  
// Horaires aujourd'hui: ${todayHours ?? "non disponibles"}  
// Tarifs: ${formatPriceLevel(priceLevel) ?? "non renseignés"}  
// Extrait d'un avis: ${topReview ?? "aucun avis disponible"}\`  
// \- Retourner ce texte  
//  
// Si call.name inconnu → retourner "Outil inconnu"

### 3.3 Gérer les appels parallèles avec Promise.all

**Prompt Copilot :**

// Dans generateRoadMessage, remplacer la logique de function call existante :  
//  
// Après le premier appel generateWithRetry :  
//  
// CAS 1 — Aucun functionCall → retourner response.text ?? "" directement  
//  
// CAS 2 — Un ou plusieurs functionCalls :  
// const calls \= response.functionCalls // FunctionCall\[\]  
//  
// Exécuter tous les outils en parallèle  
// const toolResults \= await Promise.all(calls.map(call \=\> handleFunctionCall(call)))  
//  
// // Logger  
// logger.debug("gemini", \`${calls.length} outil(s) appelé(s) :\`, calls.map(c \=\> c.name))  
//  
// // Construire l'historique complet  
// const contents: Content\[\] \= \[  
// { role: "user", parts: \[{ text: userPrompt }\] },  
// { role: "model", parts: calls.map(c \=\> ({ functionCall: c })) },  
// {  
// role: "user",  
// parts: calls.map((c, i) \=\> ({  
// functionResponse: {  
// name: c.name,  
// response: { output: toolResults\[i\] }  
// }  
// }))  
// }  
// \]  
//  
// // Relancer UNE SEULE FOIS avec tout l'historique  
// const finalResponse \= await generateWithRetry({  
// model: GEMINI_MODEL,  
// contents,  
// config: { systemInstruction: systemPrompt }  
// // Pas de tools ici — Gemini ne doit plus appeler d'outils dans ce second tour  
// })  
//  
// logTokens(finalResponse)  
// return finalResponse.text ?? ""

### 3.4 Mettre à jour buildSystemPrompt et buildUserPrompt

**Prompt Copilot :**

// Mettre à jour buildSystemPrompt dans gemini.ts :  
//  
// Remplacer la section outils par :  
// "Tu disposes de deux outils pour enrichir ton message :  
//  
// getWikipediaSummary(title) :  
// Utilise-le pour les lieux historiques, monuments, sites naturels remarquables,  
// personnages célèbres associés à un lieu. Donne accès au contexte encyclopédique.  
//  
// getPlaceDetails(name, lat, lng) :  
// Utilise-le pour les lieux visitables par le public (musées, châteaux, sites avec  
// billetterie, parcs aménagés). Donne accès à la note Google, les horaires du jour,  
// les tarifs et un extrait d'avis client.  
// Ne pas appeler pour des éléments géographiques naturels sans infrastructure.  
//  
// Tu peux appeler les deux si c'est pertinent (ex: château historique visitable).  
// Si les horaires indiquent une fermeture dans moins d'une heure, mentionne-le.  
// Ne mentionne jamais les outils dans ta réponse finale.  
// Si un outil retourne 'Non disponible', ignore-le et génère quand même le message."  
//  
// Mettre à jour buildUserPrompt :  
// Supprimer le paramètre wikipediaSummary — Gemini l'appellera lui-même  
// Nouvelle signature : buildUserPrompt(poiName, coords, poiTags)  
// Nouveau contenu :  
// \`Lieu : ${poiName}  
// Coordonnées GPS : ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}  
// Tags OSM : ${relevantTags || "aucun"}  
// Génère le message audio.\`  
//  
// Mettre à jour l'interface GenerateMessageParams :  
// Supprimer wikipediaSummary  
// { poiName, coords, poiTags, enabledThemes }  
//  
// Dans generateRoadMessage :  
// Toujours passer les deux outils :  
// config: { tools: \[wikipediaTool, placesTool\], systemInstruction: systemPrompt }

---

## STEP 4 — Simplifier useRoadStories.ts

**Prompt Copilot :**

// Dans useRoadStories.ts, dans la fonction tick() :  
//  
// Supprimer ces lignes :  
// const wikiTag \= newPOI.tags\["wikipedia"\]  
// const wikiTitle \= wikiTag ? wikiTag.replace(/^\\w{2}:/, "") : newPOI.name  
// const wikipediaSummary \= await getWikipediaSummary(wikiTitle)  
//  
// Gemini appelle Wikipedia lui-même via tool use — plus besoin de le faire ici.  
//  
// Simplifier l'appel à generateRoadMessage :  
// const message \= await generateRoadMessage({  
// poiName: newPOI.name,  
// coords: { lat: newPOI.lat, lng: newPOI.lng },  
// poiTags: newPOI.tags,  
// enabledThemes,  
// })  
//  
// Supprimer l'import de getWikipediaSummary dans ce fichier

---

## STEP 5 — Mettre à jour copilot-instructions.md

Ajouter cette section dans `.github/copilot-instructions.md` :

\#\# Google Places API

\*\*Proxy\*\* : toujours appeler /api/places — jamais l'API Google directement depuis le frontend  
\*\*Clé API\*\* : process.env.GOOGLE_PLACES_API_KEY côté serveur uniquement (api/places.ts)  
\*\*FieldMask\*\* : ne jamais utiliser places.\* — toujours lister les champs exactement

\#\#\# Facturation

\- SKU : Text Search Advanced (\~29$/1000 requêtes, \~6 800 requêtes gratuites/mois)  
\- Cache 24h dans le proxy pour éviter les appels répétés sur le même POI  
\- FieldMask exact : places.id,places.displayName,places.rating,places.userRatingCount,  
 places.priceLevel,places.currentOpeningHours,places.reviews

\#\#\# PlaceResult (src/services/places.ts)  
{  
 rating: number | null  
 userRatingCount: number | null  
 isOpenNow: boolean | null  
 todayHours: string | null  
 priceLevel: string | null  
 topReview: string | null  
}

\#\#\# Outils Gemini  
| Outil | Quand Gemini l'appelle |  
|---|---|  
| getWikipediaSummary | Lieux historiques, monuments, géographie remarquable |  
| getPlaceDetails | Lieux visitables : musées, châteaux, sites avec billetterie |

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

curl \-X POST http://localhost:3000/api/places \\

\-H "Content-Type: application/json" \\

\-d '{"name": "Pont du Gard", "lat": 43.9467, "lng": 4.5353}'

Réponse attendue :

{  
 "rating": 4.8,  
 "userRatingCount": 42580,  
 "isOpenNow": true,  
 "todayHours": "Lundi: 09:00 – 21:00",  
 "priceLevel": "PRICE_LEVEL_MODERATE",  
 "topReview": "Site exceptionnel, à couper le souffle..."  
}

### Tester le cache

\# Deuxième appel identique → doit retourner instantanément sans appel Google

curl \-X POST http://localhost:3000/api/places \\  
 \-H "Content-Type: application/json" \\  
 \-d '{"name": "Pont du Gard", "lat": 43.9467, "lng": 4.5353}'

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

_"Le Musée d'Orsay est à deux kilomètres. Noté 4,7 sur 5 par plus de 65 000 visiteurs. Ouvert jusqu'à 21h45 ce soir, entrée à tarif modéré."_

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
| Pas d'avis ni horaires                         | Note, horaires, tarifs intégrés       |
| 1 outil déclaré                                | 2 outils, appels parallèles possibles |
| Boucle fixe dans useRoadStories                | Boucle de décision dans Gemini        |

---

## Ordre de développement recommandé

1. ✅ Configurer Google Cloud \+ activer Places API (New)
2. ✅ Ajouter `GOOGLE_PLACES_API_KEY` dans Vercel Dashboard (sans préfixe VITE\_)
3. ✅ Créer `api/places.ts` — proxy avec cache \+ Text Search
4. ✅ Tester le proxy : `npx vercel dev` \+ curl Pont du Gard
5. ✅ Tester le cache : deuxième appel identique → réponse immédiate
6. ✅ Créer `src/services/places.ts` — getPlaceDetails \+ formatPriceLevel
7. ✅ Ajouter `placesTool` dans `gemini.ts` (STEP 3.1)
8. ✅ Refactoriser `handleFunctionCall` → retourne string (STEP 3.2)
9. ✅ Implémenter `Promise.all` dans `generateRoadMessage` (STEP 3.3)
10. ✅ Mettre à jour system prompt \+ user prompt (STEP 3.4)
11. ✅ Simplifier `useRoadStories` — supprimer appel Wikipedia (STEP 4\)
12. ✅ Tester sur Pont du Gard en DEV_COORDS
13. ✅ Tester sur Col du Galibier — Gemini ne doit pas appeler Places
14. ✅ Vérifier dans Google Cloud Console que les requêtes apparaissent
15. ✅ Déployer sur Vercel et vérifier que le proxy fonctionne en production
