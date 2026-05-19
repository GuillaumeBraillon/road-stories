import { GoogleGenAI, Type } from "@google/genai";
import type { Content, FunctionCall, GenerateContentResponse } from "@google/genai";
import { getWikipediaSummary } from "./wikipedia";
import { logger } from "./logger";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const GEMINI_MODEL = "gemini-2.5-flash";

const wikipediaTool = {
  functionDeclarations: [
    {
      name: "getWikipediaSummary",
      description: "Récupère le résumé Wikipedia en français d'un lieu",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Nom du lieu à rechercher" },
        },
        required: ["title"],
      },
    },
  ],
};

export interface GenerateMessageParams {
  poiName: string;
  wikipediaSummary: string | null;
  enabledThemes: string[];
}

function buildSystemPrompt(enabledThemes: string[]): string {
  return `Tu es un guide de voyage sympa qui accompagne des automobilistes.
Génère un message audio de maximum 30 secondes (environ 60 mots).
Le message doit être naturel et oral, jamais encyclopédique.
Commence directement par une accroche sans dire bonjour.
Inclus une anecdote ou un fait marquant en lien avec : ${enabledThemes.join(", ")}.
Réponds uniquement avec le texte à lire à voix haute.`;
}

function buildUserPrompt(poiName: string, summary: string | null): string {
  return `Lieu : ${poiName}
Informations disponibles : ${summary ?? "Non disponible"}
Génère le message.`;
}

function logTokens(response: GenerateContentResponse): void {
  const meta = response.usageMetadata;
  if (!meta) return;
  logger.debug("gemini", `Tokens prompt : ${meta.promptTokenCount}`);
  logger.debug("gemini", `Tokens réponse : ${meta.candidatesTokenCount}`);
  logger.debug("gemini", `Total : ${meta.totalTokenCount}`);
}

async function handleFunctionCall(call: FunctionCall, userPrompt: string, systemPrompt: string): Promise<string> {
  const title = String((call.args as Record<string, unknown>)["title"] ?? call.name ?? "");
  const summary = await getWikipediaSummary(title);

  const contents: Content[] = [
    { role: "user", parts: [{ text: userPrompt }] },
    { role: "model", parts: [{ functionCall: { name: call.name, args: call.args, id: call.id } }] },
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            name: call.name,
            response: { output: summary ?? "Non disponible" },
          },
        },
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: { systemInstruction: systemPrompt },
  });

  logTokens(response);
  return response.text ?? "";
}

export async function generateRoadMessage(params: GenerateMessageParams): Promise<string> {
  const { poiName, wikipediaSummary, enabledThemes } = params;
  const systemPrompt = buildSystemPrompt(enabledThemes);
  const userPrompt = buildUserPrompt(poiName, wikipediaSummary);

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: { tools: [wikipediaTool], systemInstruction: systemPrompt },
  });

  logTokens(response);

  const functionCalls = response.functionCalls;
  if (functionCalls && functionCalls.length > 0) {
    return handleFunctionCall(functionCalls[0], userPrompt, systemPrompt);
  }

  return response.text ?? "";
}
