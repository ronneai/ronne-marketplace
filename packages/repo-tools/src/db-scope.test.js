import { describe, expect, it } from "vitest";
import { CORE_TESTS, databaseScope } from "./db-scope.js";

const none = () => null;

describe("databaseScope (112)", () => {
  it("runs only the database code's tests for other code", () => {
    expect(
      databaseScope(
        [
          "apps/web/src/features/catalogue/Catalogue.tsx",
          "packages/cli/src/submit.ts",
          "docs/gone.md",
        ],
        (path) => (path.endsWith(".md") ? null : "export const a = 1;"),
      ),
    ).toBe("core");
  });

  it("runs everything when the database code changes", () => {
    for (const file of [
      "apps/web/src/server/db/migrations/0021_new.ts",
      "apps/web/src/server/domains/items/repositories/item-repository.ts",
      "apps/web/src/server/setup/setup.ts",
      "pnpm-lock.yaml",
      "apps/web/package.json",
      "apps/web/vitest.config.ts",
      ".github/workflows/database.yml",
      "packages/config/vitest.js",
      "apps/web/scripts/migrate.ts",
      "apps/web/src/server/domains/submissions/actions/frontmatter.db.test.ts",
    ])
      expect(databaseScope([file], none)).toBe("all");
  });

  it("runs everything when a changed file queries the database, wherever it is", () => {
    const at = "apps/web/src/server/domains/audit/actions/audit.ts";
    expect(databaseScope([at], () => 'import { sql } from "kysely";')).toBe("all");
    expect(databaseScope([at], () => 'await db.selectFrom("user")')).toBe("all");
    expect(databaseScope(["docs/a.md"], () => 'from "kysely"')).toBe("core");
    expect(databaseScope([at], () => "import { sql } from 'kysely';")).toBe("all");
  });

  it("runs everything when it can't tell (an empty list)", () => {
    expect(databaseScope([], none)).toBe("all");
    // A code file that's gone may have queried the database.
    expect(databaseScope(["apps/web/src/server/domains/usage/services/usage.ts"], none)).toBe(
      "all",
    );
  });

  it("names the database code's own tests", () => {
    expect(CORE_TESTS).toContain("src/server/db/");
    expect(CORE_TESTS).toContain("/repositories/");
    expect(CORE_TESTS).toContain("scripts/");
  });
});
