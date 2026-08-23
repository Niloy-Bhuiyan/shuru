import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Next loads .env.local for the app under test, but the Playwright process
 * does not. Specs that assert on feature flags (which OAuth buttons render)
 * must see the same values the app was built with, so load it here too.
 */
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    if (process.env[key] === undefined) {
      process.env[key] = line.slice(i + 1).trim();
    }
  }
}

/**
 * E2E config.
 *
 * Runs on a dedicated port so it never collides with a dev server you have
 * open. Mobile is the design baseline, so the default project is a 390px
 * viewport; the desktop project guards the larger layout.
 */

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "mobile",
      // 390px is the design baseline the pixel system was built against
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],

  /**
   * Runs against a PRODUCTION build, not `next dev`.
   *
   * `next dev` compiles each route on first request. With workers in parallel
   * all hitting a cold server, that first compile intermittently exceeded the
   * assertion timeout and failed navigation tests that pass in isolation —
   * flakiness caused purely by the dev server.
   *
   * Building first also means the gate exercises what actually ships,
   * including middleware and the security headers, rather than the dev
   * server's looser behaviour. The build cost is paid once per run.
   */
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
