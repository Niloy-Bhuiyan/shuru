import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // Vitest 4 runs on Vite 8 (Rolldown), which transforms via oxc and honors
  // tsconfig's `jsx: "preserve"` (set for Next.js) — leaving JSX untransformed
  // and breaking import analysis of any .tsx a test pulls in (e.g. buildShards
  // from GlassShatter.tsx). The React plugin handles the JSX transform for the
  // test build only; the Next.js app build still reads jsx:"preserve".
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
