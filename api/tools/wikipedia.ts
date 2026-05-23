//api/tools/wikipedia.ts
/**
 * Pont d'outil (Tool) pour l'agent Gemini.
 * Redirige l'exécution vers la logique centralisée de l'endpoint wikipedia.
 */
import { declaration as endpointDeclaration, execute as endpointExecute } from "../wikipedia";

// On réexporte la déclaration attendue par Gemini
export const declaration = endpointDeclaration;

/**
 * Interface d'exécution appelée par l'orchestrateur de l'Edge handler Gemini
 */
export async function execute(args: Record<string, unknown>): Promise<string> {
  // On délègue directement à la cascade centralisée
  return endpointExecute(args);
}
