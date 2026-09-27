import { describe, expect, it } from "vitest";
import { isDocumentation, planChecks } from "./pre-commit.js";

const CORE = [
  ["pnpm", "lint"],
  ["pnpm", "typecheck"],
  ["pnpm", "test"],
  ["pnpm", "build"],
];

describe("isDocumentation", () => {
  it.each([
    ["docs/features/002-db-layer/SPEC.md", true],
    ["docs/spec/ronne.schema.json", false],
    ["README.md", true],
    ["CLAUDE.md", true],
    ["apps/web/AGENTS.md", true],
    ["docs/MVP/ideas.txt", true],
    ["apps/web/src/server/db/url.ts", false],
    ["examples/items/house-style/ronne.yaml", false],
    [".github/workflows/ci.yml", false],
    ["package.json", false],
  ])("%s → %s", (path, expected) => {
    expect(isDocumentation(path)).toBe(expected);
  });
});

describe("planChecks", () => {
  it("skips everything for a documentation-only commit", () => {
    expect(planChecks(["docs/features/README.md", "CLAUDE.md"])).toEqual([]);
  });

  it("skips an empty commit", () => {
    expect(planChecks([])).toEqual([]);
  });

  it("runs lint, typecheck, test and build when code changes", () => {
    expect(planChecks(["docs/x.md", "apps/web/src/app/page.tsx"])).toEqual(CORE);
  });

  it("adds the lockfile and license checks when dependencies change", () => {
    expect(planChecks(["apps/web/package.json", "pnpm-lock.yaml"])).toEqual([
      ["pnpm", "install", "--frozen-lockfile"],
      ...CORE,
      ["pnpm", "licenses:check"],
    ]);
  });

  it("runs the checks for the manifest schema and the examples, which the tests read", () => {
    expect(planChecks(["docs/spec/ronne.schema.json"])).toEqual(CORE);
    expect(planChecks(["examples/items/concise/ronne.yaml"])).toEqual(CORE);
  });
});
