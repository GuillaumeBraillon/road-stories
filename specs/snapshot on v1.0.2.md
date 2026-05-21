# Voici le fonctionnement en v1.0.2.

# Flux global

- L’app détecte un POI avec le GPS.
- Elle récupère des infos contextuelles (tags OSM \+ éventuellement résumé Wikipedia).
- Elle demande à Gemini de générer un texte court, oral, factuel.
- Le texte est lu en synthèse vocale.

## En local

- Le front appelle Gemini directement avec la clé côté navigateur.
- La génération inclut:
  - un prompt système très contraint (style guide culturel, max \~60 mots),
  - un filtrage des tags OSM pertinents,
  - une logique de retry sur erreurs non-429.

Si Gemini demande un appel outil Wikipedia, le front fait l’appel puis renvoie la réponse à Gemini pour finaliser le message.

## En production

- Le front ne parle pas à Gemini directement.
- Le front envoie une requête à l’API serveur.
- L’API serveur:
  - lit la clé serveur,
  - construit le prompt,
  - appelle Gemini via REST,
  - gère un éventuel tool call Wikipedia côté serveur,
  - renvoie seulement le message final au front.

En cas d’échec Gemini, l’API renvoie une erreur 502 avec message explicite.

# Pourquoi est-ce stable ?

- Local et prod ont chacun leur chemin dédié, donc moins de dépendance à un environnement de dev proxy.
- La clé sensible de prod reste côté serveur.
- Le comportement est prévisible: local pour itérer vite, prod via endpoint serveur.

# Point d’attention

- Le service Wikipedia actuel encode bien les espaces, mais pas explicitement les apostrophes via remplacement forcé.
- Selon les titres, ça peut réintroduire des 404 sur certains noms avec apostrophe.
