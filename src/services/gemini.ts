import { GoogleGenAI, Type } from "@google/genai";
import type { Content, FunctionCall, GenerateContentResponse } from "@google/genai";
import { getWikipediaSummary } from "./wikipedia";
import { logger } from "./logger";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
// modeles connus : "gemini-3.1-flash-lite", "gemini-2.5-flash"
const GEMINI_MODEL = "gemini-3.1-flash-lite";

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
  coords: { lat: number; lng: number };
  poiTags: Record<string, string>;
  wikipediaSummary: string | null;
  enabledThemes: string[];
}

function buildSystemPrompt(enabledThemes: string[]): string {
  return `Tu es un guide culturel pour automobilistes sur route ou autoroute.
Génère un message audio de maximum 30 secondes (environ 60 mots).
Le message doit être factuel, oral et naturel — jamais encyclopédique.
Commence le message en nommant le lieu (ex: "Vous passez a proximité du Pont du Gard...", "de l'abbaye de..."), sans introduction ni salutation.
Donne une information concrète ou une anecdote marquante sur le lieu en lien avec : ${enabledThemes.join(", ")}.
Ne pose pas de question. Ne conclus pas par une formule de style. Reste factuel jusqu'au bout.
Si tu utilises l'outil Wikipedia et qu'il retourne "Non disponible", génère le message sans Wikipedia — ne rappelle pas l'outil une seconde fois.
Si les informations disponibles sont "Non disponible", appuie-toi sur les tags OSM pour caractériser le lieu. Ne génère jamais de détails historiques ou géographiques précis sur un lieu que tu ne peux pas identifier avec certitude depuis les coordonnées GPS et les tags fournis.
Réponds uniquement avec le texte à lire à voix haute.`;
}

const CULTURAL_TAG_PREFIXES = [
  "historic",
  "tourism",
  "natural",
  "amenity",
  "religion",
  "denomination",
  "heritage",
  "monument",
  "ruins",
  "castle_type",
  "site_type",
  "start_date",
  "end_date",
  "description",
  "inscription",
  "information",
  "operator",
  "ele",
  "height",
];

function buildUserPrompt(poiName: string, coords: { lat: number; lng: number }, poiTags: Record<string, string>, summary: string | null): string {
  const relevantTags = Object.entries(poiTags)
    .filter(([k]) => CULTURAL_TAG_PREFIXES.some((prefix) => k === prefix || k.startsWith(prefix + ":")))
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  // Nom dérivé d'une inscription gravée : demander une traduction/explication plutôt qu'une description de lieu
  if (poiTags["inscription"] === poiName) {
    return `Un monument se trouve à proximité — coordonnées GPS : ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}
Tags OSM : ${relevantTags || "aucun"}
Ce monument porte l'inscription gravée : "${poiName}"
Traduis et explique cette inscription en 2-3 phrases orales naturelles. Ne nomme pas le monument — concentre-toi sur ce que signifie l'inscription.
Génère le message.`;
  }

  return `Lieu : ${poiName}
Coordonnées GPS : ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}
Tags OSM : ${relevantTags || "aucun"}
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

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("429");
}

async function generateWithRetry(params: Parameters<typeof ai.models.generateContent>[0]): ReturnType<typeof ai.models.generateContent> {
  const model = params.model ?? GEMINI_MODEL;
  logger.debug("gemini", `URL : https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  logger.debug("gemini", "Envoi :", typeof params.contents === "string" ? params.contents : JSON.stringify(params.contents, null, 2));

  let lastError: unknown;
  for (const [attempt, delay] of [[0, 0], ...RETRY_DELAYS_MS.map((d, i) => [i + 1, d])]) {
    if (attempt > 0) {
      logger.debug("gemini", `Retry ${attempt} après ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay as number));
    }
    try {
      return await ai.models.generateContent(params);
    } catch (error) {
      if (isRateLimitError(error)) throw error; // 429 : pas de retry, laisser le prochain tick réessayer
      lastError = error;
    }
  }
  throw lastError;
}

async function handleFunctionCall(call: FunctionCall, userPrompt: string, systemPrompt: string): Promise<string> {
  const title = String((call.args as Record<string, unknown>)["title"] ?? call.name ?? "");
  const summary = await getWikipediaSummary(title);
  logger.debug("gemini", `Wikipedia (tool call) "${title}" :`, summary ?? "Non disponible");

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

  const response = await generateWithRetry({
    model: GEMINI_MODEL,
    contents,
    config: { systemInstruction: systemPrompt },
  });

  logTokens(response);
  return response.text ?? "";
}

export async function generateRoadMessage(params: GenerateMessageParams): Promise<string> {
  const { poiName, coords, poiTags, wikipediaSummary, enabledThemes } = params;
  const systemPrompt = buildSystemPrompt(enabledThemes);
  const userPrompt = buildUserPrompt(poiName, coords, poiTags, wikipediaSummary);

  // On passe l'outil uniquement si on n'a pas pu obtenir de résumé Wikipedia,
  // pour laisser Gemini tenter avec un titre alternatif.
  // Si on a déjà un résumé, pas besoin de l'outil.
  const tools = wikipediaSummary === null ? [wikipediaTool] : undefined;

  const response = await generateWithRetry({
    model: GEMINI_MODEL,
    contents: userPrompt,
    config: { ...(tools ? { tools } : {}), systemInstruction: systemPrompt },
  });

  logTokens(response);

  const functionCalls = response.functionCalls;
  if (functionCalls && functionCalls.length > 0) {
    return handleFunctionCall(functionCalls[0], userPrompt, systemPrompt);
  }

  return response.text ?? "";
}
