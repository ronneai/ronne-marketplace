/**
 * Shared Vitest settings. Each package spreads these into its own `vitest.config.ts`.
 * @type {import("vitest/config").UserConfig["test"]}
 */
export const testDefaults = {
  include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.{ts,tsx}"],
  environment: "node",
  passWithNoTests: false,
};
