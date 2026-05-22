import * as wikipedia from "./wikipedia";
import * as places from "./places";

/**
 * Liste des tools Gemini disponibles côté agent (Wikipedia, Places, etc).
 * Pour ajouter un nouveau tool : créer un fichier dans ce dossier et l'importer ici.
 */
export const TOOLS = [wikipedia, places];

/**
 * Déclarations JSON des tools Gemini (pour tool use Gemini REST).
 */
export const toolDeclarations = {
  functionDeclarations: TOOLS.map((t) => t.declaration),
};

/**
 * Exécute un tool Gemini par son nom, avec les arguments fournis.
 * @param name Nom du tool Gemini
 * @param args Arguments pour le tool
 * @returns Résultat string ou "Non disponible"
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = TOOLS.find((t) => t.declaration.name === name);
  if (!tool) return "Non disponible";
  return tool.execute(args);
}
