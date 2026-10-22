import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    // Havok ships as a large wasm/glue pair; keep them as real files.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4096,
  },
  server: {
    host: true,
  },
});
