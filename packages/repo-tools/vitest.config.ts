import { testDefaults } from "@ronneai/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { ...testDefaults, include: ["src/**/*.test.js"] },
});
