import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// React SPA + Cloudflare Worker built together.
// `vite dev` runs the Worker locally alongside the client with HMR.
// `vite build` emits the client assets and the Worker bundle for `wrangler deploy`.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
