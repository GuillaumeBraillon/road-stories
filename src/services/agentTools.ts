import { Type } from "@google/genai";
import type { FunctionCall } from "@google/genai";
import { getWikipediaSummary } from "./wikipedia";
import { logger } from "./logger";

type ToolDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: Type;
    properties: Record<string, { type: Type; description: string }>;
    required: string[];
  };
};

type AgentTool = {
  declaration: ToolDeclaration;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

const wikipediaTool: AgentTool = {
  declaration: {
    name: "getWikipediaSummary",
    description: "Recupere le resume Wikipedia en francais d'un lieu",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Nom du lieu a rechercher" },
      },
      required: ["title"],
    },
  },
  execute: async (args) => {
    const title = String(args["title"] ?? "");
    const summary = await getWikipediaSummary(title);
    logger.debug("gemini", `Wikipedia (tool call) "${title}" :`, summary ?? "Non disponible");
    return summary ?? "Non disponible";
  },
};

const AGENT_TOOLS: AgentTool[] = [wikipediaTool];

export const toolDeclarations = {
  functionDeclarations: AGENT_TOOLS.map((tool) => tool.declaration),
};

export async function executeToolCall(call: FunctionCall): Promise<string> {
  const tool = AGENT_TOOLS.find((candidate) => candidate.declaration.name === call.name);
  if (!tool) return "Outil inconnu";
  return tool.execute((call.args as Record<string, unknown>) ?? {});
}
