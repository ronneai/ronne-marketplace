import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { platformRefusal, SUPPORTED_PLATFORMS, WINDOWS_NOTE } from "./platform.js";

describe("the systems rmk-server runs on (121, #222)", () => {
  it("runs on Linux, macOS and Windows, and names the three elsewhere", () => {
    expect(platformRefusal("linux")).toBeUndefined();
    expect(platformRefusal("darwin")).toBeUndefined();
    expect(platformRefusal("win32")).toBeUndefined();
    expect(platformRefusal("freebsd")).toBe("rmk-server runs on Linux, macOS and Windows.");
  });

  it("tells a start on Windows it runs in this terminal only, and where to go for boot", () => {
    expect(WINDOWS_NOTE).toBe(
      "On Windows, rmk-server runs in this terminal only (no service). To run it at boot, use WSL 2 or Linux: https://www.ronne.ai/marketplace/docs/install#windows",
    );
  });

  it("declares the same systems to npm, which then refuses to install elsewhere", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { os?: string[] };
    expect(manifest.os).toEqual([...SUPPORTED_PLATFORMS]);
  });
});
