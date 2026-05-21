/**
 * Vercel Edge Function — Gemini AI
 *
 * Implémentation via l'API REST Gemini (fetch natif) — aucune dépendance npm.
 * Compatible Vercel Edge Runtime. La clé GEMINI_API_KEY reste côté serveur.
 */

export const config = { runtime: "edge" };

import { toolDeclarations, executeTool } from "./tools/index";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { output: string } } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

interface GeminiApiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { code: number; message: string };
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

function extractText(data: GeminiApiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p): p is { text: string } => "text" in p);
  return textPart?.text ?? "";
}

function extractFunctionCall(data: GeminiApiResponse): { name: string; args: Record<string, unknown> } | null {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const fcPart = parts.find((p): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p);
  return fcPart?.functionCall ?? null;
}

async function callGeminiAPI(apiKey: string, contents: GeminiContent[], withTools: boolean): Promise<GeminiApiResponse> {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    ...(withTools ? { tools: [{ function_declarations: toolDeclarations.functionDeclarations }] } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as GeminiApiResponse;
  if (data.error) throw new Error(`Gemini ${data.error.code}: ${data.error.message}`);
  return data;
}

const RETRY_DELAYS_MS = [1_000, 2_000];

async function callWithRetry(apiKey: string, contents: GeminiContent[], withTools: boolean): Promise<GeminiApiResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1] as number));
    }
    try {
      return await callGeminiAPI(apiKey, contents, withTools);
    } catch (error) {
      if (error instanceof Error && error.message.includes("429")) throw error;
      lastError = error;
    }
  }
  throw lastError;
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
  const userContents: GeminiContent[] = [{ role: "user", parts: [{ text: userPrompt }] }];

  try {
    const data = await callWithRetry(apiKey, userContents, wikipediaSummary === null);

    const functionCall = extractFunctionCall(data);
    if (functionCall) {
      const toolResult = await executeTool(functionCall.name, functionCall.args);
      const toolContents: GeminiContent[] = [
        ...userContents,
        { role: "model", parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }] },
        { role: "user", parts: [{ functionResponse: { name: functionCall.name, response: { output: toolResult } } }] },
      ];
      const followUp = await callGeminiAPI(apiKey, toolContents, false);
      return new Response(JSON.stringify({ message: extractText(followUp) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: extractText(data) }), {
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
