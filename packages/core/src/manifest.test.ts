import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { fieldName, hasErrors } from "./issues.js";
import { MANIFEST_MAX_BYTES, parseManifest } from "./manifest.js";

const examplesDir = new URL("../../../examples/items/", import.meta.url);
const examples = readdirSync(examplesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: entry.name,
    text: readFileSync(new URL(`${entry.name}/ronne.yaml`, examplesDir), "utf8"),
  }));

const messages = (text: string) => parseManifest(text).issues.map((issue) => issue.message);

const rule = (extra = "") =>
  `name: "@a/b"\ntype: rule\ndescription: Hi.\nrule:\n  body: r.md\n  activation: always\n${extra}`;

describe("parseManifest: valid manifests", () => {
  it.each(examples)("$name has no issues and returns its manifest", ({ text }) => {
    const { manifest, issues } = parseManifest(text);
    expect(issues).toEqual([]);
    expect(manifest).toMatchObject({ name: expect.stringMatching(/^@/), type: expect.any(String) });
  });
});

describe("parseManifest: one broken manifest per type", () => {
  it.each(examples)(
    "$name without its type block (or dependencies) says what's missing",
    ({ text }) => {
      const manifest = parse(text) as Record<string, unknown>;
      // A skill's block is optional: its only field, entry, defaults to SKILL.md. Break it instead.
      if (manifest.type === "skill") {
        manifest.skill = { entry: "../SKILL.md" };
        expect(messages(stringify(manifest))).toEqual([
          '`skill.entry` must be a relative path inside the item, with / and without "..".',
        ]);
        return;
      }
      const block = manifest.type === "bundle" ? "dependencies" : String(manifest.type);
      delete manifest[block];
      const { issues } = parseManifest(stringify(manifest));
      expect(hasErrors(issues)).toBe(true);
      expect(issues.map((i) => i.message)).toContain(`\`${block}\` is required.`);
    },
  );

  it("accepts a skill without its block", () => {
    const skill = examples.find((e) => (parse(e.text) as { type: string }).type === "skill");
    const manifest = parse(skill?.text ?? "") as Record<string, unknown>;
    delete manifest.skill;
    expect(parseManifest(stringify(manifest)).issues).toEqual([]);
  });
});

describe("parseManifest: schema messages", () => {
  it("names a missing type once, without every type's rules", () => {
    expect(messages('name: "@a/b"\ndescription: Hi.\n')).toEqual(["`type` is required."]);
    expect(messages('name: "@a/b"\ntype: widget\ndescription: Hi.\n')).toHaveLength(1);
  });

  it("points at an unknown field, with its line", () => {
    const { issues } = parseManifest(rule("colour: blue\n"));
    expect(issues).toEqual([
      {
        severity: "error",
        code: "schema",
        message: "`colour` isn't a field ronne.yaml knows. Check the spelling.",
        path: "/colour",
        line: 7,
      },
    ]);
  });

  it("explains names, enums, paths, dependency keys and blocks for another type", () => {
    expect(messages(rule().replace('"@a/b"', '"a/b"'))).toEqual([
      "`name` must be a full item name like @scope/name, in lowercase letters, digits and hyphens.",
    ]);
    expect(messages(rule().replace("always", "sometimes"))).toEqual([
      "`rule.activation` must be one of: always, glob, model, manual.",
    ]);
    expect(messages(rule().replace("r.md", "../r.md"))).toEqual([
      '`rule.body` must be a relative path inside the item, with / and without "..".',
    ]);
    expect(
      messages('name: "@a/b"\ntype: bundle\ndescription: Hi.\ndependencies:\n  foo: "^1.0.0"\n'),
    ).toEqual(["`foo` in `dependencies` isn't a full item name. Use @scope/name."]);
    expect(
      messages('name: "@a/b"\ntype: agnet\ndescription: Hi.\nagent:\n  prompt: p.md\n'),
    ).toEqual([
      "`type` must be one of: skill, agent, rule, command, hook, mcp-server, permission-policy, output-style, statusline, lsp-server, bundle.",
    ]);
    expect(messages(`${rule()}agent:\n  prompt: p.md\n`)).toEqual([
      "This manifest has a block for `agent`, but its type isn't `agent`. Keep only the block for its own type.",
    ]);
  });

  it("finds the line of a nested field, and of a missing one's parent", () => {
    const { issues } = parseManifest(rule().replace("always", "glob"));
    expect(issues).toMatchObject([
      { message: "`rule.globs` is required.", path: "/rule/globs", line: 4 },
    ]);
  });
});

describe("parseManifest: YAML safety", () => {
  it("refuses duplicate keys", () => {
    expect(parseManifest('name: "@a/b"\nname: "@a/c"\n').issues).toMatchObject([
      { code: "yaml_duplicate_key", line: 2 },
    ]);
  });

  it("refuses anchors and aliases, so a small file can't expand", () => {
    const bomb = [
      "a: &a [x, x, x, x, x, x, x, x, x]",
      ...Array.from(
        { length: 8 },
        (_, i) =>
          `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [*${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}]`,
      ),
    ].join("\n");
    expect(parseManifest(bomb)).toEqual({
      manifest: null,
      issues: [expect.objectContaining({ code: "yaml_anchors" })],
    });
    expect(parseManifest("base: &b 1\n").issues[0]?.code).toBe("yaml_anchors");
  });

  it("needs a mapping at the top, and valid YAML", () => {
    expect(parseManifest("- a\n- b\n").issues[0]?.code).toBe("not_a_mapping");
    expect(parseManifest("just text\n").issues[0]?.code).toBe("not_a_mapping");
    expect(parseManifest("").issues[0]?.code).toBe("not_a_mapping");
    expect(parseManifest("name: [\n").issues[0]).toMatchObject({ code: "yaml_syntax", line: 2 });
  });

  it("refuses more than 64 KB before parsing", () => {
    const huge = `description: "${"x".repeat(MANIFEST_MAX_BYTES)}"\n`;
    expect(parseManifest(huge)).toEqual({
      manifest: null,
      issues: [expect.objectContaining({ code: "manifest_too_large" })],
    });
  });

  it("accepts Windows line endings", () => {
    expect(parseManifest(rule().replaceAll("\n", "\r\n")).issues).toEqual([]);
  });
});

describe("fieldName", () => {
  it("turns pointers into dotted names", () => {
    expect(fieldName("/agent/tools/0")).toBe("agent.tools[0]");
    expect(fieldName("/dependencies/@a~1b")).toBe("dependencies.@a/b");
    expect(fieldName("")).toBe("");
  });
});
