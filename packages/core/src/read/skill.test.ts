import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../manifest.js";
import { checkPackage } from "../package-checks.js";
import type { PackageFile } from "../package-file.js";
import { claudeCodeRenderer } from "../render/claude-code/renderer.js";
import { loadItemDir } from "../render/harness.js";
import type { Change } from "../render/types.js";
import { readSkill, skillName } from "./skill.js";
import { ReadError } from "./types.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const file = (path: string, content: string, executable?: boolean): PackageFile => ({
  path,
  bytes: encoder.encode(content),
  ...(executable === undefined ? {} : { executable }),
});
const textOf = (files: readonly PackageFile[], path: string) => {
  const found = files.find((f) => f.path === path);
  return found ? decoder.decode(found.bytes) : undefined;
};

/** The example skill as Claude Code has it: the folder `rmk` wrote into `.claude/skills/`. */
const renderedFolder = (): PackageFile[] => {
  const { changes } = claudeCodeRenderer.render(loadItemDir(`${examplesDir}secure-coding`), {
    scope: "project",
  });
  const [dir] = changes as Extract<Change, { kind: "dir" }>[];
  if (!dir) throw new Error("no folder rendered");
  return dir.files.map((f) => ({
    path: f.path,
    bytes: typeof f.content === "string" ? encoder.encode(f.content) : f.content,
    executable: f.executable ?? false,
  }));
};

describe("readSkill", () => {
  it("reads the example skill's rendered folder back into an item that renders the same folder", () => {
    const folder = renderedFolder();
    const read = readSkill(folder, { itemName: "@examples/secure-coding" });
    expect(read.warnings).toEqual([]);
    expect(read.references).toEqual([]);

    const { manifest, issues } = parseManifest(read.manifestText);
    expect(issues).toEqual([]);
    expect(checkPackage(manifest ?? {}, read.files)).toEqual([]);

    const again = claudeCodeRenderer.render(
      {
        name: "@examples/secure-coding",
        version: "1.0.0",
        manifest: { ...read.manifest, version: "1.0.0" },
        files: read.files,
      },
      { scope: "project" },
    );
    const [dir] = again.changes as Extract<Change, { kind: "dir" }>[];
    expect(
      dir?.files.map((f) => [
        f.path,
        typeof f.content === "string" ? f.content : decoder.decode(f.content),
      ]),
    ).toEqual(folder.map((f) => [f.path, decoder.decode(f.bytes)]));
  });

  it("writes ronne.yaml from SKILL.md's frontmatter when the folder has none", () => {
    const folder = renderedFolder().filter((f) => f.path !== "ronne.yaml");
    const read = readSkill(folder, { itemName: "@team/secure-coding" });
    expect(read.manifest).toEqual({
      name: "@team/secure-coding",
      type: "skill",
      description: expect.stringMatching(/^Checks code for common security mistakes/),
      skill: { entry: "SKILL.md" },
    });
    expect(read.manifestText).toMatch(/^name: "@team\/secure-coding"\ntype: skill\n/);
    expect(parseManifest(read.manifestText).issues).toEqual([]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
    expect(read.files.map((f) => f.path)).toEqual(["SKILL.md", "checklist.md", "ronne.yaml"]);
    expect(textOf(read.files, "SKILL.md")).toBe(textOf(folder, "SKILL.md"));
  });

  it("carries the license, and keeps files and executable bits as they are", () => {
    const read = readSkill(
      [
        file("SKILL.md", "---\nname: lint\ndescription: Lints.\nlicense: MIT\n---\nRun it.\n"),
        file("scripts/run.sh", "#!/bin/sh\n", true),
        file("logo.png", "\u0089PNG"),
      ],
      { itemName: "@team/lint" },
    );
    expect(read.manifest.license).toBe("MIT");
    expect(read.files.map((f) => [f.path, f.executable ?? false])).toEqual([
      ["SKILL.md", false],
      ["logo.png", false],
      ["ronne.yaml", false],
      ["scripts/run.sh", true],
    ]);
  });

  it("cuts a long description at a word, with a warning; SKILL.md keeps the full text", () => {
    const long = `${"word ".repeat(100)}end`;
    const source = `---\nname: long\ndescription: ${long}\n---\nBody.\n`;
    const read = readSkill([file("SKILL.md", source)], { itemName: "@team/long" });
    const description = String(read.manifest.description);
    expect(description.length).toBeLessThanOrEqual(300);
    expect(description).toMatch(/^word( word)*…$/);
    expect(read.warnings.map((w) => w.code)).toEqual(["description_cut"]);
    expect(textOf(read.files, "SKILL.md")).toBe(source);
    expect(parseManifest(read.manifestText).issues).toEqual([]);
  });

  it("puts a multi-line description on one line", () => {
    const read = readSkill(
      [file("SKILL.md", "---\nname: a\ndescription: |\n  One.\n  Two.\n---\n")],
      { itemName: "@team/a" },
    );
    expect(read.manifest.description).toBe("One. Two.");
  });

  it("sets a missing or different name in the uploaded SKILL.md only, with a warning", () => {
    const withoutName = "---\n# Notes stay.\ndescription: Formats code.\n---\nFormat it.\n";
    const read = readSkill([file("SKILL.md", withoutName)], { itemName: "@team/formatter" });
    expect(textOf(read.files, "SKILL.md")).toBe(
      "---\n# Notes stay.\ndescription: Formats code.\nname: formatter\n---\nFormat it.\n",
    );
    expect(read.warnings.map((w) => w.code)).toEqual(["entry_name_set"]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);

    const other = readSkill([file("SKILL.md", "---\nname: Old Name\ndescription: X.\n---\n")], {
      itemName: "@team/old-name",
    });
    expect(textOf(other.files, "SKILL.md")).toBe("---\nname: old-name\ndescription: X.\n---\n");
  });

  it("without frontmatter: the body's first line is the description, and name is added", () => {
    const read = readSkill([file("SKILL.md", "# Deploy safely\n\nSteps.\n")], {
      itemName: "@team/deploy",
    });
    expect(read.manifest.description).toBe("Deploy safely");
    expect(textOf(read.files, "SKILL.md")).toBe(
      "---\nname: deploy\n---\n# Deploy safely\n\nSteps.\n",
    );
    expect(read.warnings.map((w) => w.code)).toEqual(["description_from_body", "entry_name_set"]);
    // The draft arrives with 011's issue for the missing frontmatter description.
    expect(checkPackage(read.manifest, read.files).map((i) => i.code)).toEqual([
      "skill_frontmatter",
    ]);
  });

  it("keeps a hand-written ronne.yaml, setting only name and dropping version", () => {
    const handWritten =
      '# Mine.\nname: "@old/tool"\nversion: 2.0.0\ntype: skill\ndescription: Mine.\nkeywords: [a, b]\nskill:\n  entry: GUIDE.md\n';
    const read = readSkill(
      [
        file("ronne.yaml", handWritten),
        file("GUIDE.md", "---\nname: tool\ndescription: Mine.\n---\n"),
      ],
      { itemName: "@team/tool" },
    );
    expect(read.manifestText).toBe(
      '# Mine.\nname: "@team/tool"\ntype: skill\ndescription: Mine.\nkeywords: [ a, b ]\nskill:\n  entry: GUIDE.md\n',
    );
    expect(read.manifest).toMatchObject({ name: "@team/tool", keywords: ["a", "b"] });
    expect(read.warnings.map((w) => w.code)).toEqual(["version_removed"]);
    expect(checkPackage(read.manifest, read.files)).toEqual([]);
  });

  it("refuses a bad name, a missing entry, and a ronne.yaml that isn't a skill's", () => {
    const skill = file("SKILL.md", "---\nname: a\ndescription: A.\n---\n");
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof ReadError ? error.code : String(error);
      }
      return null;
    };
    expect(code(() => readSkill([skill], { itemName: "team/a" }))).toBe("invalid_name");
    expect(code(() => readSkill([file("README.md", "x")], { itemName: "@team/a" }))).toBe(
      "entry_missing",
    );
    expect(
      code(() => readSkill([skill, file("ronne.yaml", "type: rule\n")], { itemName: "@team/a" })),
    ).toBe("manifest_invalid");
    expect(
      code(() => readSkill([skill, file("ronne.yaml", "name: [\n")], { itemName: "@team/a" })),
    ).toBe("manifest_invalid");
    expect(
      code(() =>
        readSkill([skill, file("ronne.yaml", "description: &d A.\nkeywords: [*d]\n")], {
          itemName: "@team/a",
        }),
      ),
    ).toBe("manifest_invalid");
  });
});

describe("skillName", () => {
  it("prefers SKILL.md's name, else the folder's, made into an item name", () => {
    const skill = (name: string) => [file("SKILL.md", `---\nname: ${name}\n---\n`)];
    expect(skillName(skill("review"), "whatever")).toBe("review");
    expect(skillName(skill("Not Valid"), "My Skill!")).toBe("my-skill");
    expect(skillName([file("SKILL.md", "# x")], "Deploy_Tool")).toBe("deploy-tool");
    expect(skillName(skill("Valid Fallback"), "!!!")).toBe("valid-fallback");
  });
});

describe("readSkill's references", () => {
  it("names the MCP servers behind its allowed tools, once each, and none without them", () => {
    const read = (front: string) =>
      readSkill([file("SKILL.md", `---\nname: a\ndescription: A.\n${front}---\nBody.\n`)], {
        itemName: "@team/a",
      }).references;
    expect(
      read("allowed-tools: Read mcp__github__search mcp__github__issues, mcp__jira\n"),
    ).toEqual([
      { kind: "mcp-server", name: "github", from: "allowed-tools" },
      { kind: "mcp-server", name: "jira", from: "allowed-tools" },
    ]);
    expect(read("allowed-tools: [Bash(git *), mcp__aws__deploy]\n")).toEqual([
      { kind: "mcp-server", name: "aws", from: "allowed-tools" },
    ]);
    expect(read("allowed-tools: Read Grep\n")).toEqual([]);
    expect(read("")).toEqual([]);
  });

  it("names a local agent that runs it, not a built-in, a plugin's or an item (097)", () => {
    const read = (front: string) =>
      readSkill([file("SKILL.md", `---\nname: a\ndescription: A.\n${front}---\nBody.\n`)], {
        itemName: "@team/a",
      }).references;
    expect(read("context: fork\nagent: reviewer\n")).toEqual([
      { kind: "agent", name: "reviewer", from: "agent" },
    ]);
    for (const agent of ["Explore", "plan", "general-purpose", "tools:deploy", "@team/reviewer"])
      expect(read(`agent: ${agent}\n`), agent).toEqual([]);
  });
});
