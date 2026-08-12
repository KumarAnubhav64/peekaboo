import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, `npm run dev` (port 5173) proxies API calls to the FastAPI backend.
// In production, FastAPI serves the built `dist/` output directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
