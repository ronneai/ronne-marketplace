import { readdirSync, readFileSync } from "node:fs";
import { ITEM_TYPES } from "@ronneai/core";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { draftTemplate } from "@/server/domains/submissions/models/templates";
import { readManifest, writeField } from "./manifest-yaml";

const examples = new URL("../../../../../examples/items/", import.meta.url);
const manifests = [
  ...readdirSync(examples, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => [
      entry.name,
      readFileSync(new URL(`${entry.name}/ronne.yaml`, examples), "utf8"),
    ]),
  ...ITEM_TYPES.map((type) => [
    `template ${type}`,
    draftTemplate(type, "@a/b").find((file) => file.path === "ronne.yaml")?.content ?? "",
  ]),
];

describe("writeField", () => {
  it.each(manifests)("%s: rewriting its description changes only that line", (_name, text) => {
    const edited = writeField(text, ["description"], "A new description.", { required: true });
    const before = text.split("\n");
    const after = edited.split("\n");
    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, i) => line !== before[i]);
    expect(changed).toEqual([expect.stringMatching(/^description: "?A new description\."?$/)]);
  });

  it("keeps comments, quoting and order around the change", () => {
    const text =
      '# The item.\nname: "@a/b" # quoted\ntype: agent\ndescription: Old.\nagent:\n  # Prompt file.\n  prompt: prompt.md\n  tools: [read, grep] # flow\n';
    let edited = writeField(text, ["agent", "tools"], ["read", "grep", "shell"]);
    edited = writeField(edited, ["agent", "model"], "strong");
    edited = writeField(edited, ["description"], "New.", { required: true });
    expect(edited).toBe(
      '# The item.\nname: "@a/b" # quoted\ntype: agent\ndescription: New.\nagent:\n  # Prompt file.\n  prompt: prompt.md\n  tools: [read, grep, shell] # flow\n  model: strong\n',
    );
  });

  it("removes an optional field when it's emptied, but keeps a required one", () => {
    const text = "name: x\ndescription: Hi.\nkeywords: [a]\nlicense: MIT\n";
    expect(writeField(text, ["keywords"], [])).toBe("name: x\ndescription: Hi.\nlicense: MIT\n");
    expect(writeField(text, ["license"], "")).toBe("name: x\ndescription: Hi.\nkeywords: [a]\n");
    expect(writeField(text, ["description"], "", { required: true })).toBe(
      'name: x\ndescription: ""\nkeywords: [a]\nlicense: MIT\n',
    );
  });

  it("creates missing blocks, and leaves YAML that doesn't parse alone", () => {
    expect(writeField("name: x\n", ["rule", "globs"], ["*.ts"])).toBe(
      'name: x\nrule:\n  globs:\n    - "*.ts"\n',
    );
    expect(writeField("name: [", ["description"], "x")).toBe("name: [");
  });

  it("reads what it writes", () => {
    const text = writeField("name: x\n", ["dependencies"], { "@a/b": "^1.0.0" });
    expect(readManifest(text)).toEqual({ name: "x", dependencies: { "@a/b": "^1.0.0" } });
    expect(readManifest("- a list")).toBeNull();
    expect(readManifest("name: [")).toBeNull();
    expect(parseDocument(text).errors).toEqual([]);
  });
});
