/**
 * Drapeau indiquant si l'application s'exécute dans un contexte de développement local.
 * * @remarks
 * La détection est volontairement multi-critères car la CLI Vercel (`vercel dev`) force
 * l'injection de `NODE_ENV=production` au sein du runtime des Serverless/Edge Functions
 * afin de simuler l'environnement de production.
 * * Les critères de validation incluent :
 * - `NODE_ENV === "development"` : Contexte Node.js / Jest / Vite standard.
 * - `VERCEL_ENV === "development"` : Clé théorique Vercel pour le build local.
 * - `VERCEL === "1"` : Flag global injecté de manière consistante par l'outillage Vercel.
 * - `NOW_REGION.startsWith("dev")` : Contournement pour intercepter les workers locaux
 * Node (ex: `dev1`), `process.env.NOW_REGION` n'étant valorisé qu'en environnement de déploiement.
 * * @type {boolean}
 */
const isDev =
  process.env["NODE_ENV"] === "development" ||
  process.env["VERCEL_ENV"] === "development" ||
  process.env["VERCEL"] === "1" ||
  (process.env["NOW_REGION"] && process.env["NOW_REGION"].startsWith("dev"));

/**
 * Flag d'activation explicite des traces applicatives de niveau `DEBUG`.
 * * @remarks
 * Évalue la variable d'environnement client `VITE_ENABLE_DEBUG_LOGS`.
 * Attention : En environnement serveur pur / Edge, cette variable doit être passée explicitement
 * au processus Node.js backend, le préfixe `VITE_` n'exposant automatiquement la variable
 * que côté client (bundler Vite).
 * * @type {boolean}
 */
const isDebugEnabled = process.env["VITE_ENABLE_DEBUG_LOGS"] === "true";
export const logger = {
  /**
   * Logs de debug détaillés
   * Utile pour diagnostiquer des problèmes en production sans polluer les logs
   */
  debug: (namespace: string, ...args: unknown[]) => {
    if (isDev || isDebugEnabled) {
      console.log(`[DEBUG ${namespace}]`, ...args); // eslint-disable-line no-console
    }
  },

  /**
   * Warnings (uniquement en dev)
   */
  warn: (namespace: string, ...args: unknown[]) => {
    if (isDev) console.warn(`[WARN ${namespace}]`, ...args);
  },

  /**
   * Erreurs (toujours affichées pour monitoring)
   */
  error: (namespace: string, ...args: unknown[]) => {
    console.error(`[ERROR ${namespace}]`, ...args);
  },
};
