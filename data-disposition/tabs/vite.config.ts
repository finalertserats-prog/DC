import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      // Attachments and charts — pass through as-is (backend serves at /api/attachments/*)
      "/api/attachments": {
        target: "http://localhost:3978",
        changeOrigin: true,
      },
      "/api/charts": {
        target: "http://localhost:3978",
        changeOrigin: true,
      },
      // All other /api/* calls → rewrite to /tabs/api/* (conversation, messages, prefs, etc.)
      "/api": {
        target: "http://localhost:3978",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/tabs/api"),
      },
      "/auth": {
        target: "http://localhost:3978",
        changeOrigin: true,
      },
    },
  },
});
