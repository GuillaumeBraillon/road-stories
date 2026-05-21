Voici le fichier de spécification technique (Spec) complet pour l'ajout du nouvel outil `getWebsiteSummary`.

Ce document contient la déclaration pour Gemini, l'implémentation TypeScript sécurisée contre le CORS, et la méthode d'intégration dans ton architecture existante.

---

# SPECIFICATION TECHNIQUE : Outil `getWebsiteSummary`

## 1. Objectif du Tool

Permettre à l'agent Gemini de visiter l'URL officielle d'un établissement (récupérée via Google Places) afin d'en extraire le titre, la description métadonnées et le contenu textuel principal. Cela évite les hallucinations sur l'activité réelle d'un lieu (ex: comprendre que _Artis_ est une école de musique et non une galerie d'arts visuels).

---

## 2. Déclaration du Tool (Format `@google/genai`)

À ajouter dans ton tableau de déclarations d'outils (dans `agentTools.ts` par exemple).

```typescript
export const getWebsiteSummaryDeclaration = {
  name: "getWebsiteSummary",
  description:
    "Récupère le titre, la description meta et les premiers mots d'un site web à partir de son URL pour comprendre la spécialité exacte d'un établissement (ex: école de musique, club de sport, restaurant). À utiliser dès qu'une URL est disponible et que l'activité exacte est floue.",
  parameters: {
    type: "OBJECT",
    properties: {
      url: {
        type: "STRING",
        description: "L'URL absolue du site internet à analyser (ex: http://www.artis-mbc.fr/).",
      },
    },
    required: ["url"],
  },
};
```

---

## 3. Implémentation de la fonction (TypeScript)

> ⚠️ **Note sur le CORS (Cross-Origin Resource Sharing) :** > Si ton application s'exécute directement dans le navigateur en mode `DEV` (comme vu dans ton `gemini.ts`), faire un `fetch("http://www.artis-mbc.fr/")` échouera à cause de la sécurité CORS du navigateur.
> L'idéal est de faire passer cette requête par ton Edge Function `/api/gemini` ou d'utiliser un proxy de développement. L'implémentation ci-dessous intègre une gestion résiliente ou un fallback vers un proxy de dev (`allorigins`).

```typescript
// src/services/tools/websiteScraper.ts

interface WebsiteSummaryResult {
  title: string;
  metaDescription: string;
  mainHeadings: string[];
  textSnippet: string;
}

/**
 * Nettoie et extrait le contenu textuel pertinent d'un code HTML brut
 */
function parseHtmlContent(html: string): WebsiteSummaryResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 1. Extraction du Titre
  const title = doc.querySelector("title")?.textContent?.trim() || "Aucun titre";

  // 2. Extraction de la Meta Description
  const metaDesc =
    doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() ||
    "Aucune description disponible";

  // 3. Extraction des titres importants (H1, H2) pour comprendre le contexte
  const headings: string[] = [];
  doc.querySelectorAll("h1, h2").forEach((el, index) => {
    if (index < 5 && el.textContent) {
      // Max 5 titres pour ne pas polluer le contexte
      const text = el.textContent.trim().replace(/\s+/g, " ");
      if (text.length > 3) headings.push(text);
    }
  });

  // 4. Extraction d'un extrait de texte du corps de la page
  // On cible les paragraphes textuels en ignorant les scripts/styles
  const paragraphs: string[] = [];
  doc.querySelectorAll("p, main, article").forEach((el) => {
    const text = el.textContent?.trim().replace(/\s+/g, " ");
    if (text && text.length > 20 && paragraphs.length < 3) {
      paragraphs.push(text);
    }
  });

  const textSnippet = paragraphs.join(" | ").substring(0, 600); // Limite à 600 caractères

  return {
    title,
    metaDescription: metaDesc,
    mainHeadings: headings,
    textSnippet,
  };
}

/**
 * Exécute l'appel de scraping de manière sécurisée
 */
export async function executeGetWebsiteSummary(url: string): Promise<string> {
  if (!url) return "Erreur : URL manquante";

  try {
    let targetUrl = url;

    // Fallback CORS pour le mode de développement local (Browser-side)
    if (import.meta.env.DEV) {
      targetUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    }

    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "RoadStoriesBot/1.0 (Guide Touristique Intelligent)" },
    });

    if (!response.ok) {
      return `Impossible d'accéder au site internet (Code erreur: ${response.status})`;
    }

    let html = "";
    if (import.meta.env.DEV) {
      const json = await response.json();
      html = json.contents; // Structure spécifique renvoyée par le proxy allorigins
    } else {
      html = await response.text();
    }

    if (!html) return "Le site internet a renvoyé une page vide.";

    // Extraction des données utiles
    const data = parseHtmlContent(html);

    // Formatage de la réponse pour le contexte de Gemini
    return JSON.stringify(
      {
        status: "Succès",
        url_analysee: url,
        titre_du_site: data.title,
        description_commerciale: data.metaDescription,
        sections_principales: data.mainHeadings,
        extrait_texte: data.textSnippet,
      },
      null,
      2
    );
  } catch (error) {
    return `Erreur lors de la lecture du site internet : ${error instanceof Error ? error.message : String(error)}`;
  }
}
```

---

## 4. Plan d'Intégration dans ton code existant

### Étape A : Mettre à jour `agentTools.ts`

1. Ajoute `getWebsiteSummaryDeclaration` dans ton tableau global `toolDeclarations`.
2. Dans ta fonction `executeToolCall(call: FunctionCall)`, ajoute le cas pour router l'appel :

```typescript
case "getWebsiteSummary": {
  const url = call.args?.url as string;
  return await executeGetWebsiteSummary(url);
}

```

### Étape B : Mettre à jour la sécurité de validation dans `gemini.ts`

Dans la logique où nous filtrons les échecs des outils (le `isFailure` qu'on a codé ensemble), ajoute les signatures d'échec du scraper :

```typescript
const isFailure = result === "Non disponible" || result.startsWith("Impossible d'accéder") || result.startsWith("Erreur lors de la lecture");
```

---

## 5. Exemple de comportement attendu

### Entrée (Ce que Google Places donne à Gemini) :

```json
{ "name": "Artis", "websiteUri": "http://www.artis-mbc.fr/" }
```

### Échange avec l'outil :

1. **Gemini appelle :** `getWebsiteSummary({ url: "http://www.artis-mbc.fr/" })`
2. **L'outil répond :**

```json
{
  "status": "Succès",
  "url_analysee": "http://www.artis-mbc.fr/",
  "titre_du_site": "Artis MBC - École de musique associative à Lyon 7",
  "description_commerciale": "Artis propose des cours de piano, guitare, violon, chant et solfège pour enfants et adultes au cœur du quartier de la Guillotière à Lyon.",
  "sections_principales": ["Nos Cours de Musique", "Tarifs 2026", "Inscriptions"],
  "extrait_texte": "Bienvenue sur le site d'Artis, maison de la musique baroque et classique. Depuis 15 ans nous formons des musiciens passionnés..."
}
```

### Sortie finale de Gemini (Récit utilisateur) :

> **Artis**
> Dans la rue Mazagran se trouve **Artis**, une école de musique associative chaleureuse ancrée dans le quartier. Loin d'être une simple galerie, cette structure (accessible sur _artis-mbc.fr_) est dédiée à la pratique instrumentale. Elle propose des cours complets allant du piano au chant en passant par le violon, accueillant petits et grands dans une ambiance conviviale très appréciée des locaux.
> 📌 _Gemini + Google Places + Web_
