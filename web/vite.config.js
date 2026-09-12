import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA — builds to /dist, which Cloudflare Pages serves. All routes fall
// back to index.html (configure a Cloudflare Pages SPA/`_redirects` rule too).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    // Wipe dist on every build so a restored build cache can never carry a
    // stale file (e.g. an old _redirects) into the deployed assets.
    emptyOutDir: true,
    sourcemap: false,
  },
});
