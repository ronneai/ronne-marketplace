import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadItemDir } from "../render/harness.js";
import { buildPlugin } from "./build.js";
import { portableServer } from "./codex.js";
import { checkPluginGolden, describePluginDifferences } from "./harness.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/codex/", import.meta.url));
const example = (name: string) => loadItemDir(`${examplesDir}${name}`);
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

describe("Codex plugins", () => {
  it("build every example item as the golden files say", () => {
    const differences = checkPluginGolden("codex", examplesDir, goldenDir);
    expect(differences, describePluginDifferences(differences)).toEqual([]);
  });

  it("have an Agent Plugins plugin.json at the root, with the version", () => {
    const item = example("secure-coding");
    const plugin = buildPlugin("codex", { item, members: [item] });
    const manifest = JSON.parse(text(plugin.files.find((f) => f.path === "plugin.json")?.bytes));
    expect(manifest.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(manifest.name).toBe("examples.secure-coding");
    expect(manifest.version).toBe("1.0.0");
  });

  it("leave out agents, and an agent is empty even when its dependencies aren't", () => {
    const item = example("code-reviewer");
    const members = [example("secure-coding"), example("github-mcp"), item];
    const alone = buildPlugin("codex", { item, members });
    expect(alone.empty).toBe(true);
    expect(alone.files.map((f) => f.path)).toContain("mcp.json");
    expect(alone.warnings.map((w) => w.message).join("\n")).toContain(
      "Codex plugins carry no agents",
    );
    expect(alone.warnings.map((w) => w.message).join("\n")).not.toContain("tool list");
  });

  it("write MCP servers in the portable form, with references for secrets", () => {
    expect(
      portableServer({
        url: "https://x/mcp",
        bearer_token_env_var: "TOKEN",
        env_http_headers: { "X-Key": "KEY" },
      }),
    ).toEqual({
      type: "streamable-http",
      url: "https://x/mcp",
      headers: { "X-Key": "${KEY}", Authorization: "Bearer ${TOKEN}" },
    });
    expect(portableServer({ command: "npx", args: ["srv"], env_vars: ["API_KEY"] })).toEqual({
      type: "stdio",
      command: "npx",
      args: ["srv"],
      env: { API_KEY: "${API_KEY}" },
    });
  });

  it("refuse a name with -- (Agent Plugins)", () => {
    const base = example("secure-coding");
    const item = { ...base, name: "@my--team/secure-coding" };
    const plugin = buildPlugin("codex", { item, members: [item] });
    expect(plugin.empty).toBe(true);
    expect(plugin.warnings[0]?.code).toBe("name_refused");
  });
});
