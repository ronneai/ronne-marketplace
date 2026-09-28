import { describe, expect, it } from "vitest";
import { manifestChanges, suggestBump } from "./bump";

const base = {
  manifest: {
    name: "@team/fmt",
    type: "hook",
    keywords: ["format"],
    dependencies: { "@team/lint": "^1.0.0" },
    hook: { event: "PostToolUse", run: { script: "hooks/fmt.sh" }, timeout: 30 },
  },
  paths: ["hooks/fmt.sh", "README.md", "ronne.yaml"],
};
const change = (manifest: Record<string, unknown>, paths = base.paths) => ({
  manifest: { ...base.manifest, ...manifest },
  paths,
});

describe("suggestBump", () => {
  it("suggests major when the type block loses a field", () => {
    const hook = { event: "PostToolUse", run: { script: "hooks/fmt.sh" } };
    expect(suggestBump(base, change({ hook }))).toEqual({
      bump: "major",
      reasons: ["the hook block no longer has `timeout`"],
    });
  });

  it("suggests major when a dependency is removed", () => {
    expect(suggestBump(base, change({ dependencies: {} })).bump).toBe("major");
  });

  it("suggests major when a file the manifest names is removed", () => {
    const result = suggestBump(base, change({}, ["README.md", "ronne.yaml"]));
    expect(result).toEqual({
      bump: "major",
      reasons: ["`hooks/fmt.sh`, which the manifest names, is removed"],
    });
  });

  it("suggests minor for an added file, dependency, keyword or type-block field", () => {
    expect(suggestBump(base, change({}, [...base.paths, "docs/usage.md"])).reasons).toEqual([
      "`docs/usage.md` is new",
    ]);
    expect(
      suggestBump(base, change({ dependencies: { "@team/lint": "^1.0.0", "@team/git": "^2.0.0" } }))
        .bump,
    ).toBe("minor");
    expect(suggestBump(base, change({ keywords: ["format", "style"] })).bump).toBe("minor");
    expect(
      suggestBump(base, change({ hook: { ...base.manifest.hook, matcher: { tool: "Edit" } } }))
        .bump,
    ).toBe("minor");
  });

  it("suggests patch for anything else, such as a changed description or file", () => {
    expect(suggestBump(base, change({ description: "Formats better." }))).toEqual({
      bump: "patch",
      reasons: ["nothing is added or removed"],
    });
    // Removing a file the manifest doesn't name, or a keyword, isn't breaking.
    expect(suggestBump(base, change({ keywords: [] }, ["hooks/fmt.sh", "ronne.yaml"])).bump).toBe(
      "patch",
    );
  });

  it("lets a breaking change win over an addition", () => {
    expect(suggestBump(base, change({ dependencies: {} }, [...base.paths, "new.md"])).bump).toBe(
      "major",
    );
  });
});

describe("manifestChanges", () => {
  it("lists the top-level fields that differ, as YAML", () => {
    expect(
      manifestChanges(
        { name: "x", description: "Old.", keywords: ["a"] },
        { name: "x", description: "New.", license: "MIT", keywords: ["a"] },
      ),
    ).toEqual([
      { field: "description", before: "Old.", after: "New." },
      { field: "license", before: null, after: "MIT" },
    ]);
  });
});
