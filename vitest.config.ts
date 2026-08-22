import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // Vitest 4 runs on Vite 8 (Rolldown), which transforms via oxc and honors
  // tsconfig's `jsx: "preserve"` (set for Next.js) — leaving JSX untransformed
  // and breaking import analysis of any .tsx a test pulls in (e.g. transitionTo
  // from ForgeTransition.tsx). The React plugin handles the JSX transform for the
  // test build only; the Next.js app build still reads jsx:"preserve".
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /**
     * Threads, not the default forks pool.
     *
     * As the suite grew past ~200 tests, forks began failing intermittently on
     * Windows with "Timeout waiting for worker to respond" and spurious 5s test
     * timeouts — process-spawn overhead, not real failures: the same suite
     * passes 198/198 under threads in ~28s versus ~119s under forks.
     *
     * These tests are pure and use vi.mock for their I/O, so none of them needs
     * the process isolation forks buys.
     */
    pool: "threads",
  },
});
