import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  browserCommand,
  platformRefusal,
  SUPPORTED_PLATFORMS,
  startLines,
  WINDOWS_NOTE,
} from "./platform.js";

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

  it("prints the note after the data folder on Windows only", () => {
    expect(startLines("win32", "C:\\Users\\ana\\AppData\\Local\\RonneAI\\Marketplace")).toBe(
      `Data folder: C:\\Users\\ana\\AppData\\Local\\RonneAI\\Marketplace\n${WINDOWS_NOTE}\n`,
    );
    expect(startLines("linux", "/home/ana/.local/share/rmk-server")).toBe(
      "Data folder: /home/ana/.local/share/rmk-server\n",
    );
    expect(startLines("darwin", "/Users/ana/x")).toBe("Data folder: /Users/ana/x\n");
  });

  it("opens the browser with each system's command; on Windows, cmd.exe by its full path", () => {
    const url = "http://localhost:7650";
    expect(browserCommand("darwin", url, {})).toEqual(["open", [url]]);
    expect(browserCommand("linux", url, {})).toEqual(["xdg-open", [url]]);
    expect(browserCommand("win32", url, { SystemRoot: "D:\\WINNT" })).toEqual([
      "D:\\WINNT\\System32\\cmd.exe",
      ["/c", "start", "", url],
    ]);
    expect(browserCommand("win32", url, {})).toEqual([
      "C:\\Windows\\System32\\cmd.exe",
      ["/c", "start", "", url],
    ]);
  });

  it("declares the same systems to npm, which then refuses to install elsewhere", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { os?: string[] };
    expect(manifest.os).toEqual([...SUPPORTED_PLATFORMS]);
  });
});
