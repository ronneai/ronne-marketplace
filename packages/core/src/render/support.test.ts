import { describe, expect, it } from "vitest";
import { RENDERERS } from "./registry.js";
import { disabledTargets, installsIn, supportFor, supportOf } from "./support.js";

describe("supportOf", () => {
  it("gives every renderer's level for the type", () => {
    const support = supportOf({ name: "@a/b", type: "permission-policy" }, "permission-policy");
    expect(Object.keys(support)).toEqual(RENDERERS.map((r) => r.id));
    expect(support).toEqual({ "claude-code": "native", codex: "degraded", cursor: "degraded" });
    expect(supportOf({}, "lsp-server")).toEqual({
      "claude-code": "degraded",
      codex: "none",
      cursor: "none",
    });
  });

  it("marks a tool the manifest turns off, unless it couldn't take the type anyway", () => {
    const manifest = {
      targets: {
        cursor: { enabled: false },
        codex: { enabled: true },
        copilot: { enabled: false },
      },
    };
    expect(disabledTargets(manifest)).toEqual(["copilot", "cursor"]);
    expect(supportOf(manifest, "skill")).toEqual({
      "claude-code": "native",
      codex: "native",
      cursor: "off",
    });
    expect(supportFor("output-style", ["codex", "claude-code"])).toEqual({
      "claude-code": "off",
      codex: "none",
      cursor: "none",
    });
  });

  it("says none for a type it doesn't know, and installs only where native or degraded", () => {
    expect(Object.values(supportFor("widget", []))).toEqual(["none", "none", "none"]);
    expect(
      (["native", "degraded", "off", "none", undefined] as const).map((level) => installsIn(level)),
    ).toEqual([true, true, false, false, false]);
  });
});
