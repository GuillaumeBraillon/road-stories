# Dossier `api/tools/` — Outils Gemini pour Road Stories

Ce dossier regroupe les "tools" (outils) déclarés pour l'agent Gemini côté serveur (API Edge). Chaque fichier exporte :

- une déclaration JSON compatible Gemini REST API (tool use)
- une fonction d'exécution asynchrone (`execute`) qui effectue l'appel réel (ex : Wikipedia, Google Places)

## Rôle du dossier

- **Centraliser les outils d'enrichissement IA** accessibles à Gemini lors de la génération de messages culturels.
- **Faciliter l'ajout de nouveaux outils** : chaque outil est un module indépendant, importé dans `index.ts`.
- **Garantir la compatibilité Edge Runtime** : aucun import de librairies Node natives, tout est compatible Vercel Edge.

## Structure

- `wikipedia.ts` : Tool Gemini pour obtenir un résumé Wikipedia en français d'un lieu.
- `places.ts` : Tool Gemini pour obtenir les détails Google Places d'un lieu public (note, horaires, tarifs, avis).
- `index.ts` : Point d'entrée qui agrège tous les tools et expose les déclarations pour Gemini.

## Ajout d'un nouvel outil

1. Créer un fichier `monTool.ts` dans ce dossier, exportant `declaration` et `execute`.
2. Importer ce fichier dans `index.ts` et l'ajouter au tableau `TOOLS`.
3. La déclaration doit respecter le format JSON Gemini (voir exemples existants).

## Exécution

Lorsqu'un tool est appelé par Gemini (tool use), la fonction `executeTool` de `index.ts` route l'appel vers le bon module et retourne le résultat à l'agent IA.

---

**Ce dossier est réservé à la logique d'orchestration des outils Gemini côté API.**
