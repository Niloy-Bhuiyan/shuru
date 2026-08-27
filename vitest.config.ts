import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // Explicit JSX transform for the test build.
  //
  // Vitest 4 runs on Vite 8 (Rolldown), which transforms via oxc and honors
  // tsconfig's `jsx` setting. This plugin was added when that setting was
  // `"preserve"`, which left JSX untransformed and broke import analysis of any
  // .tsx a test pulls in (e.g. transitionTo from ForgeTransition.tsx).
  //
  // Next 16 rewrote tsconfig to `jsx: "react-jsx"`, so that specific conflict is
  // gone — but the plugin is kept so the test build states its own transform
  // rather than inheriting whatever the framework last wrote into tsconfig.
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
