import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
});
