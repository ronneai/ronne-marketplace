import { describe, expect, it } from "vitest";
import { checkPack } from "./packs.js";

const files = (...paths) => paths.map((path) => ({ path }));
const base = ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/index.d.ts"];

describe("checkPack", () => {
  it("accepts a package of dist code, its README, LICENSE and package.json", () => {
    expect(checkPack("mcp", { name: "@ronneai/mcp", files: files(...base) })).toEqual([]);
    expect(
      checkPack("core", {
        name: "@ronneai/core",
        files: files(...base, "dist/schema/ronne.schema.json"),
      }),
    ).toEqual([]);
    // rmk ships its test helpers, for other tools' tests (027).
    expect(
      checkPack("cli", { name: "@ronneai/rmk", files: files(...base, "dist/testing.js") }),
    ).toEqual([]);
  });

  it("refuses maps, tests, sources, other test helpers, and anything off the list", () => {
    expect(
      checkPack("mcp", {
        name: "@ronneai/mcp",
        files: files(
          ...base,
          "dist/index.js.map",
          "dist/server.test.js",
          "src/index.ts",
          "dist/testing.js",
          "notes.txt",
        ),
      }),
    ).toEqual([
      "would ship dist/index.js.map",
      "would ship dist/server.test.js",
      "would ship src/index.ts",
      "would ship dist/testing.js",
      "would ship notes.txt, which isn't on the allowlist",
    ]);
  });

  it("wants the right name, the README, LICENSE and a build", () => {
    expect(checkPack("cli", { name: "rmk", files: files("package.json") })).toEqual([
      "packs as rmk, not @ronneai/rmk",
      "is missing README.md",
      "is missing LICENSE",
      "has no dist/: build it first",
    ]);
    expect(checkPack("web", { name: "x", files: [] })).toEqual(["web isn't a published package."]);
  });
});
