import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const threeEntry = fileURLToPath(new URL("./node_modules/three/build/three.module.js", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^three\/examples\/jsm\//, replacement: fileURLToPath(new URL("./node_modules/three/examples/jsm/", import.meta.url)) },
      { find: /^three$/, replacement: threeEntry },
    ],
  },
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
