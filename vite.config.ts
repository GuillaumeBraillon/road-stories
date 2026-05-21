import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

function toRequestHeaders(headers: typeof import("node:http").IncomingMessage.prototype.headers): Headers {
  const requestHeaders = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === "string") {
      requestHeaders.set(key, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => requestHeaders.append(key, item));
    }
  });
  return requestHeaders;
}

function placesApiDevPlugin(): Plugin {
  return {
    name: "road-stories-places-api-dev",
    configureServer(server) {
      server.middlewares.use("/api/places", async (req, res) => {
        try {
          const { default: handler } = (await server.ssrLoadModule("/api/places.ts")) as {
            default: (request: Request) => Promise<Response>;
          };
          const requestUrl = req.originalUrl ?? `/api/places${req.url ?? ""}`;
          const url = new URL(requestUrl, `http://${req.headers.host ?? "localhost"}`);
          const request = new Request(url, {
            method: req.method,
            headers: toRequestHeaders(req.headers),
          });
          const response = await handler(request);

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  process.env.GOOGLE_PLACES_API_KEY ??= env.GOOGLE_PLACES_API_KEY;

  return {
    plugins: [placesApiDevPlugin(), react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    server: {
      proxy: {
        // En dev local, /api/overpass est proxifié vers overpass-api.de côté serveur Node.js
        // → pas de CORS, même comportement que la Vercel Edge Function en production
        "/api/overpass": {
          target: "https://overpass-api.de",
          changeOrigin: true,
          rewrite: () => "/api/interpreter",
        },
      },
    },
  };
});
