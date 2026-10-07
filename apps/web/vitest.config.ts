import { testDefaults } from "@ronneai/config/vitest";
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
  // The same "@/…" alias as tsconfig.json, which Next.js reads but Vitest doesn't.
  // `@ronneai/core` from its source, so tests don't need `packages/core` built first.
  resolve: {
    // Exact matches, most specific first: `@ronneai/core/pack` is the packer's own entry point.
    alias: [
      { find: /^@\//, replacement: `${new URL("./src/", import.meta.url).pathname}` },
      {
        find: /^@ronneai\/core\/pack$/,
        replacement: new URL("../../packages/core/src/pack/index.ts", import.meta.url).pathname,
      },
      {
        find: /^@ronneai\/core$/,
        replacement: new URL("../../packages/core/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
  // Next.js keeps JSX as-is ("jsx": "preserve"), so tests compile it with React's automatic runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    ...shared,
    projects: [
      // Unit tests never see this clone's settings: a configured clone let an unmocked database
      // call pass here and fail in CI (092, docs/knowledge/unit-tests-and-settings.md).
      {
        extends: true,
        test: {
          name: "unit",
          include,
          exclude: dbInclude,
          env: { RONNE_ENV_FILE: ".env.unit-tests-have-none", DATABASE_URL: "", AUTH_SECRET: "" },
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: dbInclude,
          // Real schema changes on MySQL, MariaDB and PostgreSQL can take longer than Vitest's 5s
          // default on a shared CI machine (a MySQL migration test timed out there in PR #11).
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
