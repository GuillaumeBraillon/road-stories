/**
 * Lance la synthèse vocale d'un texte en français (Web Speech API)
 * - Langue : fr-FR
 * - Vitesse : normale (1.0)
 * - Pitch : normal (1.0)
 * - Résout la promesse à la fin de la lecture
 * - Gère les interruptions/cancellations comme des fins normales
 *
 * @param text Texte à lire à voix haute
 * @returns Promise résolue à la fin de la lecture
 */
export function speak(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      // "interrupted" et "canceled" sont déclenchés par speechSynthesis.cancel() — comportement intentionnel
      if (event.error === "interrupted" || event.error === "canceled") {
        resolve();
      } else {
        reject(new Error(`TTS error: ${event.error}`));
      }
    };
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Arrête immédiatement toute lecture vocale en cours
 */
export function stop(): void {
  window.speechSynthesis.cancel();
}

/**
 * Indique si une synthèse vocale est en cours
 * @returns true si la voix est en train de parler
 */
export function isSpeaking(): boolean {
  return window.speechSynthesis.speaking;
}
