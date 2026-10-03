import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exampleItems, loadItemDir } from "../render/harness.js";
import { installsIn, supportOf } from "../render/support.js";
import { buildPlugin } from "./build.js";
import { exampleMembers } from "./harness.js";
import { type MarketplaceEntry, marketplaceFor, marketplaceName } from "./marketplace.js";
import { PLUGIN_TOOLS, type PluginTool } from "./types.js";

const examplesDir = fileURLToPath(new URL("../../../../examples/items/", import.meta.url));
const goldenDir = fileURLToPath(new URL("./__golden__/marketplaces/", import.meta.url));
const options = {
  name: marketplaceName("https://registry.example.com"),
  owner: "Ronne at registry.example.com",
  description: "Released items from the Ronne registry at https://registry.example.com",
};

/** Every example that has a plugin for the tool, as a mirror entry. */
const mirrorEntries = (tool: PluginTool): MarketplaceEntry[] => {
  const examples = new Map(
    exampleItems(examplesDir).map(({ dir }) => {
      const input = loadItemDir(dir);
      return [input.name, input] as const;
    }),
  );
  return [...examples.values()]
    .filter((item) => installsIn(supportOf(item.manifest, String(item.manifest.type))[tool]))
    .map((item) => ({
      item,
      plugin: buildPlugin(tool, { item, members: exampleMembers(examples, item) }),
    }))
    .filter(({ plugin }) => !plugin.empty)
    .map(({ item, plugin }) => ({
      name: plugin.name,
      version: item.version,
      description: String(item.manifest.description ?? ""),
      source: { kind: "path", path: `plugins/${tool}/${plugin.name}` },
    }));
};

describe("marketplaces", () => {
  it.each(PLUGIN_TOOLS)("for %s match the golden files", (tool) => {
    const file = marketplaceFor(tool, mirrorEntries(tool), options);
    const golden = join(goldenDir, `${tool}.json`);
    if (process.env.UPDATE_GOLDEN === "1") {
      mkdirSync(goldenDir, { recursive: true });
      writeFileSync(golden, file.bytes);
    }
    expect(new TextDecoder().decode(file.bytes)).toBe(readFileSync(golden, "utf8"));
  });

  it("point Claude Code at archives with their SHA-256", () => {
    const file = marketplaceFor(
      "claude-code",
      [
        {
          name: "team.x",
          version: "1.4.0",
          description: "X",
          source: { kind: "archive", url: "https://r.example/x.zip", sha256: "a".repeat(64) },
        },
      ],
      options,
    );
    expect(JSON.parse(new TextDecoder().decode(file.bytes)).plugins[0].source).toEqual({
      source: "archive",
      url: "https://r.example/x.zip",
      sha256: "a".repeat(64),
    });
  });

  it("don't point Codex or Cursor at archives", () => {
    const archive = { kind: "archive", url: "https://r.example/x.zip", sha256: "a" } as const;
    for (const tool of ["codex", "cursor"] as const)
      expect(() =>
        marketplaceFor(
          tool,
          [{ name: "t.x", version: "1.0.0", description: "", source: archive }],
          options,
        ),
      ).toThrow();
  });

  it("are named after the instance's host", () => {
    expect(marketplaceName("https://registry.example.com")).toBe("ronne-registry-example-com");
    expect(marketplaceName("http://localhost:3000/")).toBe("ronne-localhost-3000");
  });
});
