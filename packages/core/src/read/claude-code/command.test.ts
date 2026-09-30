import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../manifest.js";
import { checkPackage } from "../../package-checks.js";
import type { PackageFile } from "../../package-file.js";
import { claudeCodeRenderer } from "../../render/claude-code/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change } from "../../render/types.js";
import { commandName, readCommand } from "./command.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const file = (path: string, content: string): PackageFile => ({
  path,
  bytes: encoder.encode(content),
});
const MARKER = /<!-- managed by rmk: [^>]+ -->\n/;
const read = (text: string, itemName = "@team/cmd") =>
  readCommand(file("cmd.md", text), { itemName });

/** A command rendered for Claude Code: a skill folder's SKILL.md (023). */
const renderedSkillMd = (item: ReturnType<typeof loadItemDir>) => {
  const [change] = claudeCodeRenderer.render(item, { scope: "project" }).changes as Extract<
    Change,
    { kind: "dir" }
  >[];
  const skillMd = change?.files.find((f) => f.path === "SKILL.md");
  if (!skillMd) throw new Error("nothing rendered");
  return typeof skillMd.content === "string" ? skillMd.content : decoder.decode(skillMd.content);
};

describe("readCommand", () => {
  it("reads the example command's text, written as a .claude/commands file, back to the same item", () => {
    const example = loadItemDir(`${examplesDir}review-diff`);
    const original = renderedSkillMd(example);
    // A command Claude Code reads from .claude/commands/: the same text, without rmk's marker.
    const read = readCommand(file("review-diff.md", original.replace(MARKER, "")), {
      itemName: "@examples/review-diff",
    });
    // `name` is a skill's field, not a command file's.
    expect(read.warnings.map((w) => [w.code, w.message.match(/`([\w-]+)`/)?.[1]])).toEqual([
      ["field_dropped", "name"],
    ]);
    expect(read.manifest).toEqual({
      name: "@examples/review-diff",
      type: "command",
      description: example.manifest.description,
      command: { body: "command.md", args: [{ name: "target", required: false }] },
    });
    const body = (files: readonly PackageFile[]) =>
      decoder.decode(files.find((f) => f.path === "command.md")?.bytes);
    expect(body(read.files)).toBe(body(example.files));
    const { manifest, issues } = parseManifest(read.manifestText);
    expect(issues).toEqual([]);
    expect(checkPackage(manifest ?? {}, read.files)).toEqual([]);
    expect(
      renderedSkillMd({
        name: "@examples/review-diff",
        version: "1.0.0",
        manifest: { ...read.manifest, version: "1.0.0" },
        files: read.files,
      }),
    ).toBe(original);
  });

  it("turns declared $name placeholders into {{name}} and leaves the rest as written", () => {
    const result = read(
      "---\ndescription: Migrates.\nargument-hint: <issue> [branch]\narguments: issue branch\ndisable-model-invocation: true\n---\nMove $issue to $branch, not $issues, \\$issue or $ARGUMENTS.\n",
    );
    expect(result.manifest.command).toEqual({
      body: "command.md",
      args: [
        { name: "issue", required: true },
        { name: "branch", required: false },
      ],
    });
    expect(decoder.decode(result.files.find((f) => f.path === "command.md")?.bytes)).toBe(
      "Move {{issue}} to {{branch}}, not $issues, \\$issue or $ARGUMENTS.\n",
    );
    expect(result.warnings).toEqual([]);
    expect(result.references).toEqual([]);
  });

  it("keeps positional placeholders as written, with a warning", () => {
    const result = read(
      "---\ndescription: Fixes.\ndisable-model-invocation: true\n---\nFix issue $0 on $ARGUMENTS[1].\n",
    );
    expect(decoder.decode(result.files.find((f) => f.path === "command.md")?.bytes)).toBe(
      "Fix issue $0 on $ARGUMENTS[1].\n",
    );
    expect(result.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining("positional placeholders"),
    ]);
  });

  it("drops tool restrictions, the model and bad argument names, and says a model-run command becomes the person's", () => {
    const result = read(
      "---\ndescription: Deploys.\nallowed-tools: Bash(git *) mcp__aws__deploy\nmodel: opus\narguments: [env, Bad-Name]\n---\nDeploy $env.\n",
    );
    expect(result.warnings.map((w) => w.message.match(/`([\w-]+)`/)?.[1] ?? w.message)).toEqual([
      "Bad-Name",
      expect.stringContaining("run by the model"),
      "allowed-tools",
      "model",
    ]);
    expect(result.references).toEqual([{ kind: "mcp-server", name: "aws", from: "allowed-tools" }]);
    expect(checkPackage(result.manifest, result.files)).toEqual([]);
  });

  it("takes the first line as the description when there's none, and the license", () => {
    const result = read(
      "---\nlicense: MIT\ndisable-model-invocation: true\n---\n# Tidy imports\n\nDo it.\n",
    );
    expect(result.manifest).toMatchObject({ description: "Tidy imports", license: "MIT" });
    expect(result.warnings.map((w) => w.code)).toEqual(["description_from_body"]);
    const bare = read("Just do it.\n");
    expect(bare.manifest.description).toBe("Just do it.");
  });
});

describe("commandName", () => {
  it("joins subfolders with hyphens", () => {
    expect(commandName("review/diff.md")).toBe("review-diff");
    expect(commandName("deploy.md")).toBe("deploy");
    expect(commandName("Front End/New Component.md")).toBe("front-end-new-component");
  });
});
