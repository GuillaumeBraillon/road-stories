/**
 * Point d'entrée et registre centralisé des outils (tools) Gemini côté serveur (Edge).
 * Centralise les modules d'extension, expose leurs schémas OpenAPI et route leur exécution.
 * * @module api/tools/index
 */

import * as wikipedia from "./wikipedia";
import * as places from "./places";

/**
 * Signature structurelle d'un module d'outil Gemini côté serveur.
 */
interface ServerTool {
  declaration: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Liste des outils Gemini disponibles côté agent (Wikipedia, Places, etc).
 * Pour ajouter un nouveau tool : créer un fichier dans ce dossier et l'importer ici.
 */
export const TOOLS: ServerTool[] = [wikipedia as ServerTool, places as ServerTool];

/**
 * Déclarations JSON des outils Gemini destinées au paramètre `tools` de l'API Gemini REST.
 */
export const toolDeclarations = {
  functionDeclarations: TOOLS.map((t) => t.declaration),
};

/**
 * Exécute un outil Gemini par son nom, avec les arguments fournis.
 * * @param {string} name - Nom de l'outil Gemini à appeler (ex: 'getWikipediaSummary').
 * @param {Record<string, unknown>} args - Arguments structurés fournis par le LLM.
 * @returns {Promise<string>} Résultat textuel de l'exécution ou "Non disponible".
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = TOOLS.find((t) => t.declaration.name === name);
  if (!tool) return "Non disponible";
  return tool.execute(args);
}
