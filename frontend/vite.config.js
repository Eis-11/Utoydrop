import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: { "/api": "http://localhost:4000" },
  },
  preview: {
    proxy: { "/api": "http://localhost:4000" },
  },
});
