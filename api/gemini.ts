/**
 * Vercel Edge Function — Gemini AI
 *
 * Protège la clé API Gemini côté serveur (variable GEMINI_API_KEY sans préfixe VITE_).
 * Les tools (Wikipedia, etc.) sont exécutés ici — extensibles via api/tools/index.ts.
 */

export const config = { runtime: "edge" };

import { GoogleGenAI } from "@google/genai";
import type { Content } from "@google/genai";
import { toolDeclarations, executeTool } from "./tools/index";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

const SYSTEM_PROMPT = `Tu es un guide culturel pour automobilistes sur route ou autoroute.
Génère un message audio de maximum 30 secondes (environ 60 mots).
Le message doit être factuel, oral et naturel — jamais encyclopédique.
Commence le message en nommant le lieu de façon variée. Utilise uniquement des formulations spatiales génériques (pas de "sur votre droite", "vous longez", "derrière vous" — la position exacte est inconnue au moment de la lecture). Exemples d'introductions possibles (ne te limite pas à celles-ci) :
- "Dans ce secteur, le Pont du Gard..."
- "Non loin d'ici, l'abbaye de..."
- "Ce territoire est marqué par..."
- "Fondée au XIIe siècle, l'abbaye de..."
- "Ici se dresse le château de..."
- "À proximité, les ruines de..."
Ne commence jamais deux messages consécutifs par la même formule.
Donne une information concrète ou une anecdote marquante sur le lieu.
Ne pose pas de question. Ne conclus pas par une formule de style. Reste factuel jusqu'au bout.
Si tu utilises l'outil Wikipedia et qu'il retourne "Non disponible", génère le message sans Wikipedia — ne rappelle pas l'outil une seconde fois.
Si les informations disponibles sont "Non disponible", appuie-toi sur les tags OSM pour caractériser le lieu. Ne génère jamais de détails historiques ou géographiques précis sur un lieu que tu ne peux pas identifier avec certitude depuis les coordonnées GPS et les tags fournis.
Réponds uniquement avec le texte à lire à voix haute.`;

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

interface GenerateMessageParams {
  poiName: string;
  coords: { lat: number; lng: number };
  poiTags: Record<string, string>;
  wikipediaSummary: string | null;
}

function buildUserPrompt(poiName: string, coords: { lat: number; lng: number }, poiTags: Record<string, string>, summary: string | null): string {
  const relevantTags = Object.entries(poiTags)
    .filter(([k]) => CULTURAL_TAG_PREFIXES.some((prefix) => k === prefix || k.startsWith(prefix + ":")))
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

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

const RETRY_DELAYS_MS = [1_000, 2_000];

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("429");
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = (process.env["GEMINI_API_KEY"] as string | undefined) ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let params: GenerateMessageParams;
  try {
    params = (await request.json()) as GenerateMessageParams;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { poiName, coords, poiTags, wikipediaSummary } = params;
  const userPrompt = buildUserPrompt(poiName, coords, poiTags, wikipediaSummary);

  const ai = new GoogleGenAI({ apiKey });

  async function callGemini(contents: string | Content[]): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_DELAYS_MS[attempt - 1] as number;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      try {
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            ...(wikipediaSummary === null ? { tools: [toolDeclarations] } : {}),
          },
        });

        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          const call = functionCalls[0];
          const toolResult = await executeTool(call.name ?? "", (call.args ?? {}) as Record<string, unknown>);

          const toolContents: Content[] = [
            { role: "user", parts: [{ text: userPrompt }] },
            { role: "model", parts: [{ functionCall: { name: call.name, args: call.args, id: call.id } }] },
            { role: "user", parts: [{ functionResponse: { name: call.name, response: { output: toolResult } } }] },
          ];

          const followUp = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: toolContents,
            config: { systemInstruction: SYSTEM_PROMPT },
          });
          return followUp.text ?? "";
        }

        return response.text ?? "";
      } catch (error) {
        if (isRateLimitError(error)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  try {
    const message = await callGemini(userPrompt);
    return new Response(JSON.stringify({ message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: `Gemini failed: ${message}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
