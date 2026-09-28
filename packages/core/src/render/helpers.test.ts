import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  changePaths,
  envRef,
  managedMarker,
  pathProblem,
  section,
  stateHash,
  targetsFor,
  toolName,
} from "./helpers.js";

describe("markers and sections", () => {
  it("writes the managed marker in each comment syntax", () => {
    expect(managedMarker("@t/x", "1.4.0", "html")).toBe("<!-- managed by rmk: @t/x@1.4.0 -->");
    expect(managedMarker("@t/x", "1.4.0", "hash")).toBe("# managed by rmk: @t/x@1.4.0");
    expect(managedMarker("@t/x", "1.4.0", "slashes")).toBe("// managed by rmk: @t/x@1.4.0");
  });

  it("fences a section by the item's name, with one trailing newline", () => {
    expect(section("@t/x", "Be brief.\n\n")).toBe(
      "<!-- rmk:begin @t/x -->\nBe brief.\n<!-- rmk:end @t/x -->\n",
    );
  });
});

describe("hashes", () => {
  it("canonical JSON sorts keys at every level and has no whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("hashes each change kind, the same for the same content", async () => {
    const file = await stateHash({ kind: "file", path: "a.md", content: "hi" });
    expect(file).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await stateHash({ kind: "file", path: "b.md", content: new TextEncoder().encode("hi") }),
    ).toBe(file);
    const key = await stateHash({
      kind: "json-key",
      path: "s.json",
      key: ["a"],
      value: { y: 1, x: 2 },
    });
    expect(
      await stateHash({ kind: "json-key", path: "s.json", key: ["a"], value: { x: 2, y: 1 } }),
    ).toBe(key);
    expect(
      await stateHash({
        kind: "json-array-item",
        path: "s.json",
        key: ["hooks"],
        item: { x: 2, y: 1 },
      }),
    ).toBe(key);
    expect(
      await stateHash({ kind: "toml-key", path: "c.toml", key: ["a"], value: { x: 2, y: 1 } }),
    ).toBe(key);
    expect(await stateHash({ kind: "section", path: "AGENTS.md", key: "@t/x", text: "hi" })).toBe(
      file,
    );
  });

  it("hashes a folder by its files' paths, hashes and executable bits, in path order", async () => {
    const one = await stateHash({
      kind: "dir",
      path: "s",
      files: [
        { path: "b.sh", content: "x", executable: true },
        { path: "a.md", content: "y" },
      ],
    });
    const same = await stateHash({
      kind: "dir",
      path: "s",
      files: [
        { path: "a.md", content: "y" },
        { path: "b.sh", content: "x", executable: true },
      ],
    });
    const bit = await stateHash({
      kind: "dir",
      path: "s",
      files: [
        { path: "a.md", content: "y" },
        { path: "b.sh", content: "x" },
      ],
    });
    expect(same).toBe(one);
    expect(bit).not.toBe(one);
  });
});

describe("names and references", () => {
  const table = {
    names: { read: "Read", shell: "Bash" },
    mcp: (server: string, tool?: string) => (tool ? `mcp__${server}__${tool}` : `mcp__${server}`),
  };

  it("maps canonical tool names, MCP tools, and warns about the rest", () => {
    expect(toolName("shell", table)).toEqual({ name: "Bash" });
    expect(toolName("mcp:github", table)).toEqual({ name: "mcp__github" });
    expect(toolName("mcp:github/search", table)).toEqual({ name: "mcp__github__search" });
    expect(toolName("teleport", table)).toMatchObject({ warning: { code: "unmapped_tool" } });
  });

  it("references environment variables without their values", () => {
    expect(envRef("GITHUB_TOKEN", "shell")).toBe("$GITHUB_TOKEN");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the tool's own placeholder syntax.
    expect(envRef("GITHUB_TOKEN", "json-template")).toBe("${GITHUB_TOKEN}");
  });

  it("reads a manifest's targets: enabled by default, with the renderer's overrides", () => {
    expect(targetsFor({}, "cursor")).toEqual({ enabled: true, overrides: {} });
    expect(
      targetsFor(
        {
          targets: {
            cursor: { enabled: false },
            "claude-code": { overrides: { model: "sonnet" } },
          },
        },
        "cursor",
      ),
    ).toEqual({ enabled: false, overrides: {} });
    expect(
      targetsFor({ targets: { "claude-code": { overrides: { model: "sonnet" } } } }, "claude-code"),
    ).toEqual({
      enabled: true,
      overrides: { model: "sonnet" },
    });
    expect(targetsFor({ targets: "nonsense" }, "cursor").enabled).toBe(true);
  });
});

describe("paths", () => {
  it("refuses paths that leave the folder, are absolute, or use backslashes", () => {
    expect(pathProblem(".claude/skills/x/SKILL.md")).toBeNull();
    for (const bad of ["", "/etc/passwd", "C:/x", "..", "a/../b", "a//b", "./a", "a\\b"])
      expect(pathProblem(bad), bad).not.toBeNull();
  });

  it("lists every path a change touches", () => {
    expect(
      changePaths({
        kind: "dir",
        path: "s",
        files: [
          { path: "a", content: "" },
          { path: "b/c", content: "" },
        ],
      }),
    ).toEqual(["s", "s/a", "s/b/c"]);
    expect(changePaths({ kind: "json-key", path: "x.json", key: ["a"], value: 1 })).toEqual([
      "x.json",
    ]);
  });
});
