import { describe, expect, it } from "vitest";
import type { PackageFile } from "../package-file.js";
import { givenDescription, readRule, readSkill, withDescription } from "./index.js";

const file = (path: string, content: string, executable?: boolean): PackageFile => ({
  path,
  bytes: new TextEncoder().encode(content),
  ...(executable ? { executable } : {}),
});
const textOf = (files: readonly PackageFile[], path: string) =>
  new TextDecoder().decode(files.find((f) => f.path === path)?.bytes);

describe("givenDescription (053)", () => {
  it("puts it on one line, and says when it's over 300 characters, without cutting it", () => {
    expect(givenDescription("  Checks\n  code.  ")).toEqual({
      text: "Checks code.",
      tooLong: false,
    });
    expect(givenDescription(" \n ")).toEqual({ text: null, tooLong: false });
    const long = "x".repeat(301);
    expect(givenDescription(long)).toEqual({ text: long, tooLong: true });
    expect(givenDescription("x".repeat(300)).tooLong).toBe(false);
  });
});

describe("withDescription (053)", () => {
  it("writes it into ronne.yaml, keeping the rest", () => {
    const read = readRule(file("style.md", "Use tabs.\n"), { itemName: "@team/style" });
    const described = withDescription(read, "Keeps the house style: tabs.");
    expect(described.manifest).toMatchObject({
      name: "@team/style",
      type: "rule",
      description: "Keeps the house style: tabs.",
      rule: read.manifest.rule,
    });
    expect(textOf(described.files, "ronne.yaml")).toBe(described.manifestText);
    expect(textOf(described.files, "rule.md")).toBe("Use tabs.\n");
    expect(described.entryChanged).toBeNull();
  });

  it("adds it to the uploaded SKILL.md's frontmatter when it has none, and only then", () => {
    const bare = readSkill(
      [
        file("SKILL.md", "---\nname: x\nlicense: MIT\n---\n# X\n"),
        file("run.sh", "#!/bin/sh\n", true),
      ],
      { itemName: "@team/x" },
    );
    const described = withDescription(bare, "Runs x: the checks.");
    expect(textOf(described.files, "SKILL.md")).toBe(
      '---\nname: x\nlicense: MIT\ndescription: "Runs x: the checks."\n---\n# X\n',
    );
    expect(described.entryChanged).toBe("SKILL.md");
    expect(described.files.find((f) => f.path === "run.sh")?.executable).toBe(true);

    const noFrontmatter = withDescription(
      { files: [file("SKILL.md", "# X\n")], manifestText: 'name: "@team/x"\ntype: skill\n' },
      "Does x.",
    );
    expect(textOf(noFrontmatter.files, "SKILL.md")).toBe("---\ndescription: Does x.\n---\n# X\n");

    const own = readSkill([file("SKILL.md", "---\nname: x\ndescription: Mine.\n---\nX\n")], {
      itemName: "@team/x",
    });
    const kept = withDescription(own, "Other.");
    expect(textOf(kept.files, "SKILL.md")).toContain("description: Mine.");
    expect(kept.entryChanged).toBeNull();
  });
});
