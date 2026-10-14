import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { platformRefusal, SUPPORTED_PLATFORMS } from "./platform.js";

describe("the systems rmk-server runs on (121)", () => {
  it("runs on Linux and macOS, and points Windows at WSL 2 or a Linux VM", () => {
    expect(platformRefusal("linux")).toBeUndefined();
    expect(platformRefusal("darwin")).toBeUndefined();
    expect(platformRefusal("win32")).toBe(
      "rmk-server runs on Linux and macOS. On Windows, run it in WSL 2 or a Linux virtual machine: https://www.ronne.ai/marketplace/docs/install#windows",
    );
  });

  it("declares the same systems to npm, which then refuses to install elsewhere", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { os?: string[] };
    expect(manifest.os).toEqual([...SUPPORTED_PLATFORMS]);
  });
});
