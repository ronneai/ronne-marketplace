import { defineConfig, devices } from "@playwright/test";
import { prepareInstance } from "./e2e/harness";

// The config is loaded by the runner and again by each worker. The runner prepares the instance
// and hands it to the workers through the environment, so there's exactly one per run.
if (!process.env.RONNE_E2E_INSTANCE) {
  process.env.RONNE_E2E_INSTANCE = JSON.stringify(prepareInstance());
}
const instance: { baseURL: string; env: Record<string, string> } = JSON.parse(
  process.env.RONNE_E2E_INSTANCE,
);

/** End-to-end tests (feature 006): a production build, a fresh instance, Chromium. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: instance.baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The next binary directly: through `pnpm exec`, the stop signal didn't reach the server and the
    // run never ended.
    command: `node_modules/.bin/next start -p ${new URL(instance.baseURL).port}`,
    url: `${instance.baseURL}/api/health`,
    env: instance.env,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
