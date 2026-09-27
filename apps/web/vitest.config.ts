import { testDefaults } from "@ronne/config/vitest";
import { defineConfig } from "vitest/config";

// Two projects, so CI can run just the database tests against each server (feature 004):
// - unit: everything else;
// - db: *.db.test.ts, which use a real database, from TEST_DATABASE_URL (in-memory SQLite by default).
// `vitest run` runs both; `vitest run --project db` runs only the database tests.
// The root settings hold no include/exclude: with `extends: true`, Vitest concatenates arrays, so a
// root include would leak into both projects.
const { include = [], ...shared } = testDefaults;
const dbInclude = include.map((pattern) =>
  pattern.replace(/\.test\.\{ts,tsx\}$/, ".db.test.{ts,tsx}"),
);

export default defineConfig({
  // Next.js keeps JSX as-is ("jsx": "preserve"), so tests compile it with React's automatic runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    ...shared,
    projects: [
      { extends: true, test: { name: "unit", include, exclude: dbInclude } },
      { extends: true, test: { name: "db", include: dbInclude } },
    ],
  },
});
