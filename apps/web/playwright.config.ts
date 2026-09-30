import { defineConfig, devices } from "@playwright/test";
import { type Instance, prepareBlankInstance, prepareInstance } from "./e2e/harness";

// The config is loaded by the runner and again by each worker. The runner prepares the instances
// and hands them to the workers through the environment, so there's exactly one set per run.
if (!process.env.RONNE_E2E_INSTANCE) {
  process.env.RONNE_E2E_INSTANCE = JSON.stringify({
    main: prepareInstance(),
    // Two instances that aren't set up yet (feature 036): the wizard, and the form without JavaScript.
    wizard: prepareBlankInstance(),
    nojs: prepareBlankInstance(),
  });
}
const instances: {
  main: Instance;
  wizard: Instance & { dir: string };
  nojs: Instance & { dir: string };
} = JSON.parse(process.env.RONNE_E2E_INSTANCE);

const server = (instance: Instance, url: string) => ({
  // The next binary directly: through `pnpm exec`, the stop signal didn't reach the server and the
  // run never ended.
  command: `node_modules/.bin/next start -p ${new URL(instance.baseURL).port}`,
  url: `${instance.baseURL}${url}`,
  env: instance.env,
  reuseExistingServer: false,
  timeout: 60_000,
});

/** End-to-end tests (feature 006): a production build, fresh instances, Chromium. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: "**/setup-*.e2e.ts",
      use: { ...devices["Desktop Chrome"], baseURL: instances.main.baseURL },
    },
    {
      name: "wizard",
      testMatch: "**/setup-wizard.e2e.ts",
      use: { ...devices["Desktop Chrome"], baseURL: instances.wizard.baseURL },
    },
    {
      name: "wizard-nojs",
      testMatch: "**/setup-nojs.e2e.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: instances.nojs.baseURL,
        javaScriptEnabled: false,
      },
    },
  ],
  webServer: [
    server(instances.main, "/api/health"),
    // Health answers 503 until setup, so the blank instances are ready when the setup page is.
    server(instances.wizard, "/setup"),
    server(instances.nojs, "/setup"),
  ],
});
