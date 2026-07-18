import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      path: fileURLToPath(new URL("./path-browser.ts", import.meta.url)),
    },
  },
});
