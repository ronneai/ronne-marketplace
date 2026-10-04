import { join, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { dataDir } from "./paths.js";

describe("rmk-server's data folder (082)", () => {
  it("uses RONNE_DATA_DIR on every system", () => {
    for (const platform of ["darwin", "linux", "win32"] as const)
      expect(dataDir(platform, { RONNE_DATA_DIR: "/srv/ronne" }, "/home/me")).toBe("/srv/ronne");
  });

  it("macOS: Application Support", () => {
    expect(dataDir("darwin", {}, "/Users/me")).toBe(
      join("/Users/me", "Library", "Application Support", "RonneAI Marketplace"),
    );
  });

  it("Linux: XDG_DATA_HOME, else ~/.local/share", () => {
    expect(dataDir("linux", { XDG_DATA_HOME: "/data/xdg" }, "/home/me")).toBe(
      join("/data/xdg", "rmk-server"),
    );
    expect(dataDir("linux", {}, "/home/me")).toBe(
      join("/home/me", ".local", "share", "rmk-server"),
    );
    expect(dataDir("freebsd", {}, "/home/me")).toBe(
      join("/home/me", ".local", "share", "rmk-server"),
    );
  });

  it("Windows: LOCALAPPDATA, else the profile's AppData\\Local", () => {
    expect(
      dataDir("win32", { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }, "C:\\Users\\me"),
    ).toBe("C:\\Users\\me\\AppData\\Local\\RonneAI\\Marketplace");
    expect(dataDir("win32", {}, "C:\\Users\\me")).toBe(
      win32.join("C:\\Users\\me", "AppData", "Local", "RonneAI", "Marketplace"),
    );
  });
});
