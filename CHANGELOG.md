# Journal des modifications (Changelog)

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet respecte le [Versionnage Sémantique](https://semver.org/spec/v2.0.0.html).

## [1.0.14] - 2026-05-22

### Fix

- **API Gemini** : Correction d'un crash critique sur l'environnement de développement (`vercel dev`) lié à l'incompatibilité de l'interface `Request` entre le Runtime Node.js et le Runtime Edge.
- **Architecture** : Mise en place d'une détection bivalente (Node/Edge) pour assurer une lecture fiable du payload JSON, quelle que soit la plateforme d'exécution.
- **Logs** : Uniformisation de la télémétrie serveur via l'utilisation exclusive du service `logger`, garantissant une meilleure observabilité sur Vercel.
- **Payload API** : Correction des clés de l'API REST Google (`systemInstruction` et `functionDeclarations`) pour se conformer au standard camelCase, résolvant des instabilités potentielles lors des appels d'inférence.

## [1.0.13] - 2026-05-22

### Added

- Ajout de logs détaillés et typés dans le service Wikipédia (`src/services/wikipedia.ts`) pour tracer l'exécution de la cascade (OSM, Wikidata, Fallback textuel) et isoler les erreurs réseau ou timeouts.
- Instrumentation de l'orchestrateur `gemini.ts` pour monitorer le cycle de vie des tokens, le statut du prefetch Google Places et les réponses intermédiaires de l'IA.

### Fixed

- Résolution d'un deadlock (boucle infinie) dans l'orchestrateur de requêtes en implémentant une boucle multi-tours (`while`) pour la résolution séquentielle ou parallèle des outils, combinée à l'activation du mode `NONE` (`toolConfig`) sur la passe d'inférence finale.
- Correction des critères d'éligibilité à l'enrichissement Google Places dans `src/services/prompts.ts` : extension de la détection aux tags `historic` (ex: `castle`) pour forcer l'extraction des données pratiques (notes, avis, horaires) sur les monuments historiques ouverts au public.

## [1.0.12] - 2026-05-22

### Ajouté

- README dans les dossiers api, api/tools, services, hooks, components.

## [1.0.11] - 2026-05-22

### Ajouté

- Jsdocs

## [1.0.10] - 2026-05-22

### Ajouté

- `src/components/BottomSheet.tsx` — composant générique pour les panneaux coulissants.
- `src/components/ThemePanel.tsx`, `HistoryPanel.tsx`, `SettingsPanel.tsx` — chaque panneau UI extrait dans son propre composant.
- `src/components/ToolBadges.tsx` — badges d'outils réutilisables pour l'affichage dans l'historique et le message courant.
- `src/hooks/useOverpassCache.ts` — hook de cache Overpass pour éviter les requêtes redondantes.
- `src/hooks/usePoiFilter.ts`, `src/services/poiFilter.ts` — centralisation de la logique de filtrage POI (`shouldSkipPOI`, `isAdministrativePOI`, `hasEnoughContext`, `isEligibleForTools`).
- `src/types/core.types.ts` — types métier extraits, réexportés dans `src/types/index.ts`.

### Modifié

- `src/services/gemini.ts`, `src/services/prompts.ts` — nettoyage des prompts, alignement des types Gemini, simplification de la génération de message.
- `src/App.tsx`, `src/hooks/useRoadStories.ts` — utilisation des nouveaux hooks et composants, simplification de la gestion d'état, séparation claire UI/cache/filtrage/lecture TTS.

### Refactorisé

- Découpage des panneaux UI (App) en composants dédiés.
- Extraction et centralisation de la logique de filtrage POI et du cache Overpass.
- Nettoyage du code, corrections de formatage, wording des prompts.

## [1.0.9] - 2026-05-21

### Modifié

- `src/services/geminiShared.ts` — extraction de la logique commune Places/Gemini (`prefetchGooglePlaces`, enrichissement du prompt, validation de `toolsUsed`) pour supprimer la duplication entre dev et prod.
- `src/services/gemini.ts`, `api/gemini.ts` — utilisation du module partagé pour garder le pré-fetch Places et le prompt enrichi alignés entre local et production.
- `src/types/places.types.ts`, `src/types/gemini.types.ts` — séparation des types Places/Gemini pour garder `src/types/index.ts` centré sur les types métier de l'application.
- `package.json`, `package-lock.json` — version du projet portée à `1.0.9`.

### Corrigé

- `src/types/index.ts`, `src/components/StatusIndicator.tsx` — suppression du statut mort `wikipedia`, désormais géré en interne par les tools Gemini.

## [1.0.8] - 2026-05-21

### Ajouté

- `api/tools/places.ts` — outil Edge `getPlaceDetails` pour rendre Google Places disponible en production dans le registre d'outils Gemini.
- `api/gemini.ts` — pré-fetch Google Places côté production, aligné avec le comportement local.

### Modifié

- `api/gemini.ts` — réutilisation du prompt partagé (`src/services/prompts.ts`) côté production pour réduire les écarts local/prod.
- `api/gemini.ts` — alignement du contrat serveur pour renvoyer `{ message, toolsUsed }` et associer les `functionResponse` à leur `id` quand Gemini le fournit.
- `api/tools/index.ts` — enregistrement de `getPlaceDetails` aux côtés de `getWikipediaSummary` dans les tools disponibles en production.
- `api/tools/places.ts` — lecture autonome de `GOOGLE_PLACES_API_KEY` côté Edge, avec fallback local `VITE_GOOGLE_PLACES_API_KEY` et erreur de configuration explicite si la clé manque.

### Corrigé

- `api/gemini.ts` — correction de l'écart local/prod où la production se limitait à Gemini/Wikipedia car Google Places n'était pas exposé dans le registre d'outils Edge.

## [1.0.7] - 2026-05-21

### Ajouté

- `vite.config.ts` — middleware de développement pour `GET /api/places`, afin d'exécuter `api/places.ts` via Vite sans lancer `vercel dev` et sans erreur de transformation OXC.
- `src/services/gemini.ts` — pré-fetch automatique de Google Places pour les POI assimilables à des établissements (`amenity`, `shop`, `tourism`, `craft`), avec injection des données réelles dans le prompt Gemini.
- `src/services/gemini.ts` — validation centralisée des résultats d'outils avant ajout dans `toolsUsed`, pour ne pas afficher de badge quand un outil retourne une absence de données.

### Modifié

- `src/services/prompts.ts` — rendu des tags OpenStreetMap sous forme de liste textuelle explicite (`- clé: valeur`) au lieu d'une ligne compacte, plus lisible pour les modèles légers.
- `src/services/gemini.ts` — conservation des `functionCall` bruts renvoyés par Gemini au second tour, avec `id` et métadonnées internes, pour fiabiliser les réponses après appels d'outils.
- `src/services/gemini.ts` — fusion de `toolsUsed` détecté côté code avec `actualToolsUsed` renvoyé par Gemini dans la réponse JSON structurée.

### Corrigé

- `vite.config.ts` — correction de l'erreur dev `Expected from but found {` lorsque Vite tentait de transformer `api/places.ts?name=...` comme un module frontend.
- `src/services/gemini.ts` — correction des erreurs Gemini `400 Bad Request` au second appel après tool-use, causées par une reconstruction incomplète des `functionCall`.
- `src/services/gemini.ts` — correction des badges d'outils trop optimistes : `getWikipediaSummary` et `getPlaceDetails` ne sont plus marqués comme utilisés si leur réponse est vide, indisponible ou en erreur.

## [1.0.6] - 2026-05-21

-Add Google Places integration and end-to-end tooling support for Gemini function calls, plus UI and types updates.

-Key changes:

- Add places service (src/services/places.ts) with formatPriceLevel and getPlaceDetails implementing an 8s AbortController timeout, robust error handling (404→null, network/abort→null, log other HTTP errors), and debug logging. Uses internal /api/places.
- Introduce agent tools (src/services/agentTools.ts): register getWikipediaSummary and new getPlaceDetails tool, return human-readable tool output, export tool declarations and a safe executeToolCall with error logging.
- Update Gemini flow (src/services/gemini.ts): extract prompts to new prompts module, handle functionCalls, run tools, feed tool responses back to Gemini, collect toolsUsed, add retry logic and token logging, and return GeminiResult { message, toolsUsed } in dev path; server path expects same shape.
- Move system/user prompt generation into new prompts file (src/services/prompts.ts).
- Track used tools across the app: add toolsUsed to GeminiResult and PoiHistoryEntry types (src/types/index.ts), update hook useRoadStories to manage currentToolsUsed and persist toolsUsed in history (src/hooks/useRoadStories.ts), update storage loader to migrate older entries and populate toolsUsed (src/services/storage.ts).
- UI: display tool badges in App (src/App.tsx) using a new ToolBadges component and show badges per history entry/current message.
- Update specs (specs/road-stories-places.md) to reflect API usage, PlaceResult shape and getPlaceDetails behavior.

- These changes enable calling and tracking external tool usage safely, keep Places failures non-blocking, and surface which tools contributed to generated messages in the UI.

## [1.0.5] - 2026-05-21

### Modifié

- `api/places.ts` — endpoint proxy migré en `GET /api/places?name=...&lat=...&lng=...` pour exploiter le cache CDN Vercel (`Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600`).
- `api/places.ts` — suppression du cache mémoire local (`Map`) au profit du cache edge/CDN Vercel basé sur l'URL GET complète.
- `api/places.ts` — requête Google Places durcie avec `locationRestriction.rectangle` (zone contrainte autour des coordonnées) pour éviter les faux positifs hors zone.
- `specs/road-stories-places.md` — STEP 1 aligné avec l'implémentation réelle : GET, cache CDN, `locationRestriction`, exemples `curl` mis à jour.

### Corrigé

- `api/places.ts` — extraction de `todayHours` fiabilisée via le jour courant FR (`Intl.DateTimeFormat` + timezone `Europe/Paris`) au lieu d'un index implicite fragile.
- `api/places.ts` — erreurs upstream Google Places enrichies (corps HTTP inclus dans le message) pour diagnostiquer rapidement les `400` en production.
- `api/places.ts` — comportement explicite `404 { error: "Place not found" }` conservé et validé pour les recherches sans résultat.

## [1.0.4] - 2026-05-21

### Ajouté

- `src/services/agentTools.ts` — registre d'outils côté front (`functionDeclarations` + dispatcher d'exécution) pour préparer l'ajout de nouveaux tools (ex: Places) sans recoupler `gemini.ts` à chaque outil.

### Modifié

- `src/services/gemini.ts` — refactor de l'orchestration tool-use : prise en charge de plusieurs `functionCalls`, exécution parallèle des outils via `Promise.all`, puis second appel Gemini unique avec l'historique complet des réponses d'outils.
- `src/services/gemini.ts` — contrat `GenerateMessageParams` simplifié : suppression de `wikipediaSummary` (la décision d'appeler les tools est désormais gérée par Gemini).
- `src/hooks/useRoadStories.ts` — suppression du pré-appel Wikipedia dans le tick; le hook délègue la décision d'enrichissement à Gemini et envoie uniquement `poiName`, `coords`, `poiTags`.
- `api/gemini.ts` — alignement du contrat serveur sur le front (suppression de `wikipediaSummary` dans le payload attendu).
- `api/gemini.ts` — support de plusieurs appels outils dans un même tour (exécution parallèle + second tour sans tools).

### Corrigé

- `api/gemini.ts` — correction de l'erreur Gemini 400 liée à `thought_signature` : les `functionCall` renvoyés par Gemini sont désormais réinjectés tels quels au second tour (au lieu d'être reconstruits manuellement).

## [1.0.3] - 2026-05-21

- Update Copilot instructions and examples to use gemini-3.1-flash-lite instead of gemini-2.5-flash. Add .vercel to .gitignore and introduce a new npm script "dev:vercel" to run vercel dev with .env.local loaded. Add a CHANGELOG entry for 1.0.3 (Vercel server config). Rename specs/road-stories-places-v3.md to specs/road-stories-places.md and add a new snapshot spec (specs/snapshot on v1.0.2.md) describing v1.0.2 runtime behavior.

## [1.0.2] - 2026-05-21

### Corrigé

- `api/gemini.ts` — réécriture complète via l'API REST Gemini avec `fetch` natif (suppression de `@google/genai` côté Edge Function) : le SDK npm n'est pas compatible avec le Vercel Edge Runtime et provoquait un 502 en production
- `api/tools/wikipedia.ts` — déclaration du tool convertie en JSON brut (suppression de l'import `Type` de `@google/genai`)

## [1.0.1] - 2026-05-21

### Fix

- Error with API KEY in production

## [1.0.0] - 2026-05-21

### Sécurité

- Clé API Gemini déplacée côté serveur : création d'une Vercel Edge Function `api/gemini.ts` qui exécute les appels Gemini avec `GEMINI_API_KEY` (sans préfixe `VITE_`) — la clé n'est plus jamais exposée dans le bundle JavaScript
- `src/services/gemini.ts` — en production, `generateRoadMessage` appelle `/api/gemini` ; en développement local, l'appel direct reste actif avec `VITE_GEMINI_API_KEY` (`.env.local`, jamais committé)

### Ajouté

- `api/tools/wikipedia.ts` — implémentation serveur du tool Wikipedia (déclaration Gemini + `execute`)
- `api/tools/index.ts` — registre des tools : ajouter un nouveau tool = créer un fichier et l'enregistrer ici

---

## [0.9.4] - 2026-05-20

### Ajouté

- `StatusIndicator` — labels enrichis avec icônes et textes plus descriptifs pour chaque état (`listening`, `searching`, `wikipedia`, `generating`, `speaking`, `no-poi`)
- `StatusIndicator` — le nom du POI est maintenant affiché dès l'état `wikipedia` (auparavant seulement à partir de `generating`)
- `StatusIndicator` — le rayon de détection dans le message "aucun point d'intérêt" reflète désormais la valeur configurée dans les réglages (prop `detectionRadiusM`)

### Corrigé

- `useRoadStories` — un changement de réglages (rayon, intervalle, seuil) relance immédiatement une recherche sans attendre le prochain tick

---

## [0.9.3] - 2026-05-20

### Corrigé

- `vite.config.ts` — ajout d'un proxy dev (`server.proxy`) qui forward `/api/overpass` vers `https://overpass-api.de/api/interpreter` côté Node.js, éliminant l'erreur 404 en local (Vite ne sert pas les Edge Functions Vercel) sans impact sur le build de production

---

## [0.9.2] - 2026-05-20

### Corrigé

- `api/overpass.ts` — requêtes upstream passées en parallèle via `Promise.any()` (première réponse valide gagne) ; 6 mirrors Overpass dont `karte.io` et `openstreetmap.fr` connus pour fonctionner depuis les IPs Vercel ; ajout du header `User-Agent` ; validation JSON de la réponse pour rejeter les pages HTML renvoyées par certains endpoints en cas de rate-limit

---

## [0.9.1] - 2026-05-20

### Corrigé

- `overpass.ts` — `overpass-api.de` restauré en dernier fallback client (CORS autorisé depuis `localhost`, indispensable pour le dev local quand le proxy n'existe pas)
- `api/overpass.ts` — `AbortSignal.timeout()` remplacé par `Promise.race()` + `setTimeout` (non fiable dans le Vercel Edge Runtime) ; proxy tente désormais 3 upstream avec 9 s de timeout chacun
- `useRoadStories.ts` — status bloqué sur `"searching"` corrigé : le `catch` du tick remet maintenant `"listening"` quand l'erreur survient avant `didStartSpeaking`

## [0.9.0] - 2026-05-20

### Ajouté

- `api/overpass.ts` — Vercel Edge Function proxy pour les requêtes Overpass API ; résout les erreurs CORS bloquantes en production (le fetch est désormais serveur→serveur)

### Modifié

- `overpass.ts` — `/api/overpass` ajouté en premier endpoint de la liste de fallback ; les endpoints directs restent actifs pour le dev local (fallback automatique si 404)

---

## [0.8.1] - 2026-05-20

### Ajouté

- `manifest.json` — captures d'écran PWA `screenshot-mobile.png` (390×844) et `screenshot-desktop.png` (1280×720, `form_factor: "wide"`) pour l'interface d'installation enrichie Chrome/Edge

### Corrigé

- Icônes PWA — viewBox `692×690` (non carré) corrigé à `692×692` lors de la génération ; `icon-192.png` et `icon-512.png` ont désormais les dimensions exactes déclarées dans le manifest
- `manifest.json` — `"purpose": "any maskable"` séparé en deux entrées distinctes (`"any"` + `"maskable"`) conformément aux recommandations W3C

---

## [0.8.0] - 2026-05-20

### Corrigé

- Icône PWA — `icon_v2.svg` converti en `icon-192.png` et `icon-512.png` ; le manifest référence désormais des PNG (Chrome ne supporte pas les SVG pour les apps installées)

---

## [0.7.0] - 2026-05-20

### Ajouté

- Bouton d'installation PWA — `usePWAInstall.ts` écoute `beforeinstallprompt` et expose `isInstallable` / `install` ; bouton visible dans l'en-tête uniquement quand l'app est installable

### Corrigé

- `usePWAInstall.ts` — `await` manquant sur `deferredPrompt.prompt()` ; converti de `const` arrow vers `export function` (convention du projet)
- `sw.js` — `self.skipWaiting()` enveloppé dans `event.waitUntil()` ; `return;` inutile dans le listener `fetch` supprimé ; commentaire erroné ("Supabase") corrigé

---

## [0.6.0] - 2026-05-20

### Ajouté

- Suppression d'une entrée d'historique — bouton 🗑️ sur chaque entrée du panneau Historique ; retire également le POI de `triggeredPOIs` pour autoriser la re-détection ultérieure
- Panneau Réglages — bottom sheet ⚙️ accessible en haut à droite (à côté du bouton muet) avec trois paramètres configurables : intervalle de scan (10 / 20 / 30 / 60 s), rayon de détection (250 m / 500 m / 1 km / 2 km), seuil de déplacement Overpass (50 / 100 / 200 / 500 m) ; valeurs persistées en localStorage via `loadSettings` / `saveSettings` ; type `AppSettings` et constante `DEFAULT_SETTINGS` ajoutés dans `types/index.ts`
- Log du prompt complet envoyé à Gemini — `=== System prompt ===` et `=== User prompt ===` dans la console de développement à chaque appel

### Modifié

- `gemini.ts` refactorisé — `SYSTEM_PROMPT` converti en constante (plus de fonction `buildSystemPrompt`) ; `handleFunctionCall` ne reçoit plus `systemPrompt` en paramètre ; boucle retry simplifiée en `for (let attempt = 0; …)`
- `useRoadStories.ts` — les trois constantes de configuration (`POLL_INTERVAL_MS`, `DETECTION_RADIUS_M`, `OVERPASS_MOVE_THRESHOLD_M`) sont remplacées par le paramètre `settings: AppSettings` ; l'intervalle de scan est inclus dans les dépendances du `useEffect` principal ; le rayon et le seuil sont lus via `settingsRef` à chaque tick ; un changement de settings invalide le cache Overpass

---

## [0.5.0] - 2026-05-20

### Ajouté

- Mode muet — bouton 🔇/🔊 dans l'en-tête ; Gemini génère le message mais la TTS est sautée ; le message reste affiché jusqu'au prochain POI ; activer le mute pendant la lecture stoppe immédiatement la voix
- Affichage du texte généré — bloc dédié sous l'indicateur de statut, visible pendant la lecture (mode normal) et persistant jusqu'au POI suivant (mode muet) ; le nom du POI apparaît en en-tête du bloc
- Badges de source — `Wikipedia` et/ou `Gemini` en bas du bloc message selon l'origine du contenu
- `currentMessage` et `currentMessageSource` dans `useRoadStories.ts` — états dédiés pour le texte généré et sa source (`"gemini"` | `"wiki+gemini"`)
- `operator` comme nom de fallback dans `resolvePoiName` (`overpass.ts`) — les nœuds sans `name` mais avec un `operator` (ex : "Parc Naturel Régional du Vercors") utilisent l'opérateur comme identifiant pour la recherche Wikipedia
- `"operator"` ajouté dans `CULTURAL_TAG_PREFIXES` (`gemini.ts`) — transmis à Gemini pour contextualiser la génération

### Modifié

- Pré-filtrage synchrone des POIs dans `useRoadStories.ts` — les POIs sans tags enrichissants (`ENRICHING_TAGS`) sont sautés immédiatement dans une boucle plutôt qu'en retournant et attendant le prochain tick de 30 secondes ; le check post-Wikipedia est simplifié au seul cas guidepost
- Normalisation des titres Wikipedia dans `wikipedia.ts` — conversion tout en minuscules + espaces → underscores avant l'appel REST ; Wikipedia gère les redirections vers la casse canonique
- `buildUserPrompt` dans `gemini.ts` — prompt dédié quand le nom du POI est une inscription gravée : Gemini est invité à traduire et expliquer l'inscription plutôt qu'à décrire un lieu
- `useRoadStories.ts` — la recherche Wikipedia est sautée quand le nom vient d'une `inscription` ; mutex TTS non verrouillé en mode muet

### Corrigé

- Délai de 30 secondes après filtrage d'un POI sans contexte — remplacé par une boucle synchrone passant directement au POI suivant
- Titres Wikipedia avec espaces ou casse mixte retournant 404 — corrigé par normalisation lowercase + underscores
- Gemini inventait des informations sur des lieux connus à partir d'une inscription latine — prompt dédié résolvant le problème

---

## [0.4.2] - 2026-05-20

### Modifié

- `resolvePoiName` dans `overpass.ts` — branches dérivées (`historic`, `tourism`, `natural`) supprimées : un POI n'est désormais retenu que s'il possède un tag `name`/`name:fr` explicite ou une `inscription` gravée ; les viewpoints, peaks, ruines sans nom propre sont silencieusement écartés
- `GENERIC_NAMES` dans `overpass.ts` — nettoyé : ne contient plus que les noms d'infrastructure routière générique (`tunnel`, `rue`, `carrefour`…) ; les types OSM naturels retirés (devenus inutiles sans branche `natural`)
- `capitalize` dans `overpass.ts` — fonction supprimée (plus aucun usage après la simplification de `resolvePoiName`)
- `useRoadStories.ts` — la recherche Wikipedia est sautée quand le nom du POI provient d'une `inscription` (évite un 404 systématique en console avec le texte latin comme titre)
- `buildUserPrompt` dans `gemini.ts` — prompt dédié quand le nom est une inscription gravée : Gemini est invité à traduire et expliquer l'inscription plutôt qu'à décrire un lieu, empêchant les inventions sur des monuments connus

---

## [0.4.1] - 2026-05-19

### Corrigé

- `overpass-api.de` déplacé en dernier dans la liste des endpoints de fallback (`kumi.systems` et `private.coffee` en priorité, plus fiables depuis une origine tierce)

---

## [0.4.0] - 2026-05-19

### Ajouté

- Architecture `ThemeGroup` dans `App.tsx` — les thèmes sont regroupés en 5 catégories (Patrimoine, Culture & Arts, Nature & Paysages, Tourisme & Loisirs, Lieux de culte) avec icône et sous-thèmes activables individuellement
- `ALWAYS_ACTIVE_FILTERS` dans `overpass.ts` — `tourism=information` toujours inclus indépendamment des thèmes sélectionnés
- Filtrage des guideposts sans fiche Wikipedia dans `useRoadStories.ts` — les panneaux indicateurs sans contexte suffisant sont ignorés silencieusement

### Modifié

- `getNodeName` + `isMeaningfulName` fusionnés en `resolvePoiName` dans `overpass.ts` — résolution du nom OSM avec filtrage des noms génériques intégré ; la fonction retourne `null` directement plutôt qu'un post-check externe
- `GENERIC_NAMES` dans `overpass.ts` — détection des noms d'infrastructure routière (`tunnel`, `rue`, `carrefour`…) et de types OSM non spécifiques (`ruins`, `building`) désormais intégrée dans `resolvePoiName`
- `useRoadStories.ts` — récupération Wikipedia et skip guidepost déplacés **avant** l'activation de l'état `speaking` pour éviter un flash d'UI inutile sur les POIs ignorés
- `inscription` et `information` ajoutés dans `CULTURAL_TAG_PREFIXES` de `gemini.ts` — les textes gravés et les types de panneaux sont transmis à Gemini
- Filtres OSM par thème enrichis dans `DEFAULT_THEME_GROUPS` (Patrimoine : 5 sous-thèmes ; Culture, Nature, Religion : nouveaux types ajoutés)

---

## [0.3.0] - 2026-05-19

### Ajouté

- `Theme.osmFilters` — chaque thème porte ses propres filtres OSM (`string[]`) utilisés dans la requête Overpass
- `DEFAULT_THEMES` redessinés avec 4 thèmes OSM : Patrimoine & histoire (`historic`), Attractions touristiques (`tourism=attraction/museum/artwork/information`), Nature & paysages (`natural=peak/waterfall/cave_entrance`), Lieux de culte (`amenity=place_of_worship`)
- Cache Overpass dans `useRoadStories` : Overpass n'est interrogé que si le déplacement dépasse 100 m ou si les thèmes ont changé
- Tags OSM dans le prompt Gemini : les tags culturellement pertinents du POI (`historic`, `tourism`, `start_date`, `heritage`, `description`, `ele`…) sont transmis à Gemini pour ancrer la génération
- Résolution Wikipedia via le tag OSM `wikipedia` : si le nœud OSM porte un tag `wikipedia=fr:…`, ce titre est utilisé directement pour la recherche Wikipedia

### Modifié

- `buildQuery` dans `overpass.ts` — génération dynamique des nœuds Overpass à partir des `osmFilters` des thèmes actifs ; retourne `[]` immédiatement si aucun thème n'est activé
- `getNearbyPOIs` — nouvelle signature : `(coords, themes, radiusMeters?)` remplace le filtre OSM codé en dur
- `generateRoadMessage` — `GenerateMessageParams` étendu avec `coords` et `poiTags` ; `buildUserPrompt` inclut les coordonnées GPS et les tags OSM filtrés
- Prompt système Gemini renforcé : instruction explicite de ne pas inventer de détails géographiques ou historiques si les informations disponibles ne permettent pas d'identifier le lieu avec certitude

---

## [0.2.0] - 2026-05-19

### Ajouté

- `src/types/index.ts` — types partagés : `Coords`, `POI`, `Theme`, `AppStatus`
- `src/services/geolocation.ts` — `watchPosition`, `clearWatch`, `calculateDistance` (Haversine)
- `src/services/overpass.ts` — `getNearbyPOIs` via Overpass API (POST) avec union de filtres OSM
- `src/services/wikipedia.ts` — `getWikipediaSummary` avec timeout 5 s et gestion 404/réseau
- `src/services/tts.ts` — `speak`, `stop`, `isSpeaking` via Web Speech API
- `src/services/gemini.ts` — `generateRoadMessage` avec agent Gemini 2.5 Flash et tool use Wikipedia
- `src/hooks/useGeolocation.ts` — hook GPS avec `watchPosition` et cleanup automatique
- `src/hooks/useRoadStories.ts` — hook d'orchestration principal (interval 30 s, Wake Lock, anti-doublon)
- `src/components/ToggleButton.tsx` — bouton ON/OFF rond avec `animate-pulse`
- `src/components/StatusIndicator.tsx` — affichage de l'état `idle` / `active` / `speaking`
- `src/components/ThemeSelector.tsx` — liste de cases à cocher pour les 6 thèmes
- `src/App.tsx` — interface principale Road Stories (remplace le scaffold Vite)
- `src/services/logger.ts` — utilitaire de logging conditionnel (`log`, `debug`, `warn`, `error`, `group`) avec activation via `VITE_ENABLE_DEBUG_LOGS`

---

## [0.1.0] - 2026-05-19

### Ajouté

- Scaffold du projet : React 19, TypeScript strict, Vite, Tailwind CSS v4
- Intégration du SDK Gemini 2.5 Flash (`@google/genai`)
- Configuration ESLint (TypeScript, React Hooks, React Refresh) et Prettier
- Scripts npm : `dev`, `build`, `lint`, `fix`, `format`, `tsc`
- Git hooks `pre-commit` (lint + format) et `post-commit`
- Instructions développeur Copilot (`.github/copilot-instructions.md`)

---

## [0.0.1] - 2026-05-19

- Version initiale de l'application (première release publique)
