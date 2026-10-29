import { defineConfig, devices } from "@playwright/test";
import { WEB_URL } from "./helpers/env";

/**
 * End-to-end suite against the LOCAL stack only (supabase start, API on :4000,
 * web on :3000). Uses the system Chrome (`channel: "chrome"`), so no browser
 * download. `tests/canvas` covers the octodraw canvas inside Octonote;
 * `tests/integrations` covers the API / CLI / MCP surfaces.
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  globalSetup: "./global-setup.ts",
  // Next dev compiles routes on first hit; keep the budget generous.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    channel: "chrome",
    headless: process.env.E2E_HEADED ? false : true,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1400, height: 900 } } }],
});
