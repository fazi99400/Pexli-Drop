import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA — builds to /dist, which Cloudflare Pages serves. All routes fall
// back to index.html (configure a Cloudflare Pages SPA/`_redirects` rule too).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
