import { readdirSync, readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = new URL("../../../", import.meta.url);
const schema = JSON.parse(
  readFileSync(new URL("./schema/ronne.schema.json", import.meta.url), "utf8"),
);
const examplesDir = new URL("examples/items/", repoRoot);

// strictTypes is off because the schema's if/then blocks use `required` without repeating `type`,
// which is valid JSON Schema.
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictTypes: false,
  strictRequired: false,
});
addFormats.default(ajv);
const validate = ajv.compile(schema);

const examples = readdirSync(examplesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("examples/items", () => {
  it("has one example per item type", () => {
    expect(examples.length).toBeGreaterThanOrEqual(11);
  });

  it.each(examples)("%s/ronne.yaml matches the manifest schema", (name) => {
    const manifest = parse(readFileSync(new URL(`${name}/ronne.yaml`, examplesDir), "utf8"));
    const valid = validate(manifest);
    expect(validate.errors ?? [], `${name}: ${ajv.errorsText(validate.errors)}`).toEqual([]);
    expect(valid).toBe(true);
  });
});

describe("manifest schema", () => {
  const base = { name: "@a/b", description: "x" };

  it.each([
    ["an unscoped name", { ...base, name: "b", type: "bundle", dependencies: { "@a/c": "^1" } }],
    [
      "a glob rule without globs",
      { ...base, type: "rule", rule: { body: "r.md", activation: "glob" } },
    ],
    [
      "a type block for another type",
      { ...base, type: "agent", agent: { prompt: "p.md" }, skill: {} },
    ],
    [
      "a path that leaves the item folder",
      { ...base, type: "rule", rule: { body: "../r.md", activation: "always" } },
    ],
    [
      "a stdio MCP server with a URL",
      {
        ...base,
        type: "mcp-server",
        "mcp-server": { transport: "stdio", command: "x", url: "https://a.test" },
      },
    ],
    [
      "a hook with both command and script",
      { ...base, type: "hook", hook: { event: "tool.after", run: { command: "a", script: "b" } } },
    ],
    [
      "an unknown tool name",
      { ...base, type: "agent", agent: { prompt: "p.md", tools: ["bash"] } },
    ],
    ["an unknown top-level field", { ...base, type: "skill", foo: 1 }],
    ["a bundle without dependencies", { ...base, type: "bundle" }],
  ])("rejects %s", (_label, manifest) => {
    expect(validate(manifest)).toBe(false);
  });

  it("accepts dependencies on every type (096): a rule, a skill on an agent, an MCP server", () => {
    const dependencies = { "@a/c": "^1.0.0" };
    for (const manifest of [
      { ...base, type: "rule", rule: { body: "r.md", activation: "always" }, dependencies },
      { ...base, type: "skill", skill: {}, dependencies: { "@a/agent": "^1.0.0" } },
      {
        ...base,
        type: "mcp-server",
        "mcp-server": { transport: "stdio", command: "x" },
        dependencies,
      },
    ])
      expect(validate(manifest), ajv.errorsText(validate.errors)).toBe(true);
  });
});
