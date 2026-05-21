import * as wikipedia from "./wikipedia";
import * as places from "./places";

// Pour ajouter un nouveau tool : créer un fichier dans ce dossier et l'importer ici
export const TOOLS = [wikipedia, places];

export const toolDeclarations = {
  functionDeclarations: TOOLS.map((t) => t.declaration),
};

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = TOOLS.find((t) => t.declaration.name === name);
  if (!tool) return "Non disponible";
  return tool.execute(args);
}
