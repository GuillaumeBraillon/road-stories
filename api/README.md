# Dossier `api/` — Fonctions Edge & Orchestration IA (Road Stories)

Ce dossier contient toutes les fonctions Edge (API serverless) déployées sur Vercel pour Road Stories. Il centralise la logique serveur liée à l'IA, aux outils d'enrichissement, et aux proxys nécessaires à l'application mobile.

## Rôle du dossier

- **Exposer des endpoints API sécurisés** pour l'orchestration IA (Gemini), la récupération de POI OSM, et l'accès aux services tiers (Google Places, Wikipedia).
- **Contourner les limitations CORS** en proxyant les requêtes sensibles côté serveur (Overpass, Google Places).
- **Centraliser la logique d'enrichissement IA** (tool use Gemini, orchestration des prompts, etc.).
- **Garantir la compatibilité Edge Runtime** (aucune dépendance Node native, tout est compatible Vercel Edge).

## Structure

- `gemini.ts` : Handler principal pour la génération de messages audio via Gemini (tool use, prompt, orchestration IA).
- `overpass.ts` : Proxy POST vers Overpass API (OpenStreetMap) pour récupérer les POI sans CORS.
- `places.ts` : Proxy GET/POST vers Google Places API pour obtenir les détails d'un lieu public.
- `tools/` : Dossier des tools Gemini (déclarations et exécutions des outils accessibles à l'IA).

## Ajout d'une nouvelle API

1. Créer un fichier `maFonction.ts` dans ce dossier, exportant un handler Edge (compatible Vercel Edge Runtime).
2. Si besoin d'un outil Gemini, ajouter le module dans `tools/` et l'importer dans le handler concerné.
3. Documenter le handler avec des JSDoc détaillés (voir exemples existants).

## Bonnes pratiques

- **Aucune dépendance Node.js native** (Edge Runtime uniquement).
- **Gestion stricte des erreurs** (try/catch, messages explicites).
- **Respect des conventions de typage TypeScript strict**.
- **Documentation systématique (JSDoc, README)** pour chaque handler et outil.

---

**Ce dossier est réservé à la logique serveur, à l'orchestration IA et aux proxys API pour Road Stories.**
