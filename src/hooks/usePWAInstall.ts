/**
 * Hook usePWAInstall
 *
 * Détecte si l’application est installable en PWA et fournit la fonction d’installation.
 * Fournit isInstallable (bool) et install() (callback).
 */
import { useState, useEffect } from "react";

// Type pour l'événement PWA beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Hook de gestion de l'installation PWA (Progressive Web App).
 *
 * @description
 * Écoute l'événement `beforeinstallprompt` du navigateur et permet de déclencher
 * manuellement l'installation de l'application comme PWA. Gère l'état d'installabilité
 * et fournit une action pour afficher le prompt d'installation.
 *
 * @returns {Object} État et actions PWA
 * @returns {boolean} isInstallable - True si l'app peut être installée
 * @returns {Function} install - Déclenche le prompt d'installation
 *
 * @example
 * ```tsx
 * const { isInstallable, install } = usePWAInstall();
 *
 * return (
 *   <>
 *     {isInstallable && (
 *       <button onClick={install}>
 *         Installer l'application
 *       </button>
 *     )}
 *   </>
 * );
 * ```
 */
export function usePWAInstall() {
  /**
   * Stocke l’événement beforeinstallprompt pour déclencher l’installation plus tard.
   */
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  /**
   * Indique si l’app est installable (bannière possible)
   */
  const [isInstallable, setIsInstallable] = useState(false);

  /**
   * Effet : écoute l’événement beforeinstallprompt du navigateur
   * - Empêche l’affichage automatique de la bannière
   * - Stocke l’événement pour affichage manuel
   */
  useEffect(() => {
    const handler = (e: Event) => {
      // Empêcher Chrome d'afficher la bannière automatiquement
      e.preventDefault();
      // Stocker l'événement pour le déclencher plus tard
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  /**
   * Déclenche le prompt d’installation PWA
   * - Appelle prompt() sur l’événement stocké
   * - Met à jour l’état selon la réponse utilisateur
   */
  const install = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();

    // Attendre la réponse de l'utilisateur
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  return { isInstallable, install };
}
