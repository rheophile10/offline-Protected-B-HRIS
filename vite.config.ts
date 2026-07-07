import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds the entire app into ONE self-contained dist/index.html.
// No external requests at runtime — see standards.md (offline + anti-exfiltration).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2020",
    assetsInlineLimit: 100_000_000, // inline everything, no separate asset files
    cssCodeSplit: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 100_000,
  },
});
