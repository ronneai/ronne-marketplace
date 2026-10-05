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

  it("lets the server ship the web app in app/, but never a .env or a native binary (082)", () => {
    // THIRD_PARTY_NOTICES: written at pack time by notices.js (084); WinSW and its licence (086).
    const app = [
      "app/apps/web/server.js",
      "app/apps/web/dist-scripts/start.mjs",
      "THIRD_PARTY_NOTICES",
      "vendor/winsw/WinSW.NET461.exe",
      "vendor/winsw/LICENSE.txt",
    ];
    const pack = (...paths) =>
      checkPack("server", {
        name: "@ronneai/marketplace",
        files: files(...base, ...app, ...paths),
      });
    expect(
      pack(
        "app/node_modules/next/dist/server/next.js",
        "app/apps/web/.next/server/app/page.js.map",
      ),
    ).toEqual([]);
    expect(
      pack(
        "app/apps/web/.env",
        "app/apps/web/.env.local",
        "app/x/better_sqlite3.node",
        "dist/run.js.map",
        "vendor/winsw/WinSW-x64.exe",
      ),
    ).toEqual([
      "would ship app/apps/web/.env",
      "would ship app/apps/web/.env.local",
      "would ship app/x/better_sqlite3.node",
      "would ship dist/run.js.map",
      "would ship vendor/winsw/WinSW-x64.exe, which isn't on the allowlist",
    ]);
    expect(pack("app/apps/web/.env.example")).toEqual(["would ship app/apps/web/.env.example"]);
    expect(checkPack("server", { name: "@ronneai/marketplace", files: files(...base) })).toEqual([
      "is missing app/apps/web/server.js",
      "is missing app/apps/web/dist-scripts/start.mjs",
      "is missing THIRD_PARTY_NOTICES",
      "is missing vendor/winsw/WinSW.NET461.exe",
      "is missing vendor/winsw/LICENSE.txt",
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
