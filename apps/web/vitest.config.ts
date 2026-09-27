import { testDefaults } from "@ronne/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next.js keeps JSX as-is ("jsx": "preserve"), so tests compile it with React's automatic runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: testDefaults,
});
