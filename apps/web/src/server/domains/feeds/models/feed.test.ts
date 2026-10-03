import { PLUGIN_BUILDER_VERSION } from "@ronneai/core/plugins";
import { describe, expect, it } from "vitest";
import {
  baseUrl,
  inClaudeCodeFeed,
  isServedTool,
  marketplaceUrl,
  pluginDescription,
  pluginInstallCommand,
  pluginKey,
  pluginUrl,
  readSidecar,
  sidecarKey,
} from "./feed";

const ref = { scope: "team", name: "secure-coding", version: "1.4.0+build.7" };

describe("plugin feeds (077)", () => {
  it("serve only Claude Code from the instance", () => {
    expect(isServedTool("claude-code")).toBe(true);
    expect(isServedTool("codex")).toBe(false);
    expect(isServedTool("cursor")).toBe(false);
  });

  it("keep each plugin under its tool, version and builder version", () => {
    expect(pluginKey("claude-code", ref)).toBe(
      `feeds/claude-code/team/secure-coding/1.4.0+build.7-b${PLUGIN_BUILDER_VERSION}.zip`,
    );
    expect(sidecarKey("claude-code", ref)).toBe(`${pluginKey("claude-code", ref)}.sha256`);
  });

  it("read only sidecars they wrote", () => {
    const bytes = (value: string) => new TextEncoder().encode(value);
    expect(readSidecar(bytes("a".repeat(64)))).toBe("a".repeat(64));
    expect(readSidecar(bytes("none"))).toBe("none");
    expect(readSidecar(bytes("A".repeat(64)))).toBeNull();
    expect(readSidecar(bytes(""))).toBeNull();
  });

  it("build URLs on PUBLIC_URL, with each segment encoded", () => {
    expect(baseUrl("https://registry.example.com//")).toBe("https://registry.example.com");
    expect(pluginUrl("https://registry.example.com/", "claude-code", ref)).toBe(
      "https://registry.example.com/api/v1/feeds/claude-code/plugins/team/secure-coding/1.4.0%2Bbuild.7.zip",
    );
    expect(marketplaceUrl("https://registry.example.com", "claude-code")).toBe(
      "https://registry.example.com/api/v1/feeds/claude-code/marketplace.json",
    );
  });

  it("start a deprecated version's description with the deprecation", () => {
    expect(pluginDescription("Checks code.", null)).toBe("Checks code.");
    expect(pluginDescription("Checks code.", "Use @team/audit.")).toBe(
      "Deprecated: Use @team/audit. Checks code.",
    );
    expect(pluginDescription("", "Gone.")).toBe("Deprecated: Gone.");
  });

  it("stay fast on long runs of slashes", () => {
    const started = Date.now();
    baseUrl(`https://x${"/".repeat(100_000)}a`);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("tell from the type and manifest whether an item is in the Claude Code feed", () => {
    const item = (type: string, name = "x") => ({ scope: "team", name, type });
    expect(inClaudeCodeFeed(item("skill"), {})).toBe(true);
    expect(inClaudeCodeFeed(item("bundle"), {})).toBe(true);
    expect(inClaudeCodeFeed(item("statusline"), {})).toBe(false);
    expect(inClaudeCodeFeed(item("permission-policy"), {})).toBe(false);
    expect(inClaudeCodeFeed(item("rule"), { rule: { activation: "model" } })).toBe(true);
    expect(inClaudeCodeFeed(item("rule"), { rule: { activation: "manual" } })).toBe(true);
    expect(inClaudeCodeFeed(item("rule"), { rule: { activation: "glob" } })).toBe(false);
    expect(inClaudeCodeFeed(item("rule"), { rule: { activation: "always" } })).toBe(false);
    // Turned off for Claude Code by its own manifest.
    expect(
      inClaudeCodeFeed(item("skill"), { targets: { "claude-code": { enabled: false } } }),
    ).toBe(false);
    // A name Claude Code reserves.
    expect(inClaudeCodeFeed({ scope: "claude-tools", name: "x", type: "skill" }, {})).toBe(false);
  });

  it("give the /plugin install command for this instance", () => {
    expect(
      pluginInstallCommand(
        { scope: "team", name: "secure-coding" },
        "https://registry.example.com/",
      ),
    ).toBe("/plugin install team.secure-coding@ronne-registry-example-com");
  });
});
