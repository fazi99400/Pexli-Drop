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
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split the heavy libraries into their own long-cached chunks so the
        // first page load isn't one giant blocking file, and returning visitors
        // reuse the cached vendor chunks.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("ethers")) return "ethers";
          if (id.includes("viem") || id.includes("@noble") || id.includes("@scure") || id.includes("abitype")) return "viem";
          if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
          if (id.includes("react") || id.includes("scheduler")) return "react";
          return "vendor";
        },
      },
    },
  },
});
