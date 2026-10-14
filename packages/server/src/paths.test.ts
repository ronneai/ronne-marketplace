import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dataDir } from "./paths.js";

describe("rmk-server's data folder (082)", () => {
  it("uses RONNE_DATA_DIR on every system", () => {
    for (const platform of ["darwin", "linux"] as const)
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
});
