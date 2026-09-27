import { describe, expect, it } from "vitest";
import { needsChecks } from "./docs-only.js";

describe("needsChecks", () => {
  it("skips a documentation-only change", () => {
    expect(needsChecks(["docs/features/README.md", "README.md", "docs/MVP/ideas.txt"])).toBe(false);
  });

  it("runs the checks for any code, config, schema or workflow change", () => {
    expect(needsChecks(["README.md", "apps/web/src/app/page.tsx"])).toBe(true);
    expect(needsChecks(["docs/spec/ronne.schema.json"])).toBe(true);
    expect(needsChecks([".github/workflows/ci.yml"])).toBe(true);
  });

  it("runs the checks when it can't tell (an empty list)", () => {
    expect(needsChecks([])).toBe(true);
  });
});
