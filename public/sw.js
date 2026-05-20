// Ce Service Worker est requis pour que Chrome détecte l'app comme "Installable" (PWA).
// Pas de stratégie de cache : l'app dépend de services en ligne (Gemini, Overpass, Wikipedia).

self.addEventListener("install", (event) => {
  // Force l'activation immédiate
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Prend le contrôle des clients immédiatement
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // On ne fait RIEN : toutes les requêtes passent vers le réseau normalement.
});
