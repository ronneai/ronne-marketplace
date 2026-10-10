import { describe, expect, it } from "vitest";
import { itemNameOfPlugin, pluginName, pluginNameProblem } from "./names.js";

describe("plugin names", () => {
  it("are scope.name, and read back", () => {
    expect(pluginName("@team/secure-coding")).toBe("team.secure-coding");
    expect(itemNameOfPlugin("team.secure-coding")).toBe("@team/secure-coding");
  });

  it("are workspace.scope.name outside global, and read back (118)", () => {
    expect(pluginName("@acme/team/secure-coding")).toBe("acme.team.secure-coding");
    expect(itemNameOfPlugin("acme.team.secure-coding")).toBe("@acme/team/secure-coding");
    expect(pluginName("@global/team/secure-coding")).toBe("team.secure-coding");
    // Ronne never makes `global.…`: global's plugins leave the workspace out.
    expect(itemNameOfPlugin("global.team.secure-coding")).toBeNull();
  });

  it("refuse what isn't a full item name, either way", () => {
    expect(() => pluginName("secure-coding")).toThrow();
    expect(itemNameOfPlugin("secure-coding")).toBeNull();
    expect(itemNameOfPlugin("a.b.c.d")).toBeNull();
    expect(itemNameOfPlugin("Team.x")).toBeNull();
  });

  it("say what each tool refuses", () => {
    const long = `${"a".repeat(40)}.${"b".repeat(30)}`;
    expect(pluginNameProblem("codex", long)).toBe("too_long");
    expect(pluginNameProblem("claude-code", long)).toBeNull();
    expect(pluginNameProblem("codex", "my--team.x")).toBe("double_hyphen");
    expect(pluginNameProblem("cursor", "my--team.x")).toBeNull();
    expect(pluginNameProblem("claude-code", "claude-tools.x")).toBe("reserved");
    expect(pluginNameProblem("claude-code", "claude.x")).toBeNull();
    expect(pluginNameProblem("claude-code", `${"a".repeat(64)}.${"b".repeat(64)}`)).toBe(
      "too_long",
    );
  });
});
