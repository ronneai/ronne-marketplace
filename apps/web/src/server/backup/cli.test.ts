import { describe, expect, it } from "vitest";
import { KEEP_MAX, parseBackupCommand } from "./cli";

describe("backup's flags (099)", () => {
  it("backs up with the settings by default, and reads --out, --no-settings, --keep and --yes", () => {
    expect(parseBackupCommand([])).toEqual({ mode: "backup", settings: true });
    expect(
      parseBackupCommand(["--out", "/srv/backups", "--no-settings", "--keep", "7", "--yes"]),
    ).toEqual({ mode: "backup", out: "/srv/backups", settings: false, keep: 7 });
    expect(parseBackupCommand(["--out=rel/dir", "-y"])).toEqual({
      mode: "backup",
      out: "rel/dir",
      settings: true,
    });
    expect(parseBackupCommand(["--help"])).toEqual({ mode: "help" });
    expect(parseBackupCommand(["-h"])).toEqual({ mode: "help" });
  });

  it("takes --keep from 1 to its limit, as a whole number", () => {
    expect(parseBackupCommand(["--keep", "1"])).toMatchObject({ keep: 1 });
    expect(parseBackupCommand(["--keep", String(KEEP_MAX)])).toMatchObject({ keep: KEEP_MAX });
    for (const bad of ["0", String(KEEP_MAX + 1), "-1", "1.5", "7days", "", " 3", "1e3"])
      expect(parseBackupCommand([`--keep=${bad}`]), bad).toMatchObject({
        mode: "error",
        exitCode: 2,
        message: expect.stringContaining("--keep needs a whole number"),
      });
  });

  it("refuses unknown flags, a missing value and an empty --out", () => {
    for (const argv of [["--encrypt-later"], ["--out"], ["--keep"], ["--out", " "], ["extra"]])
      expect(parseBackupCommand(argv), argv.join(" ")).toMatchObject({
        mode: "error",
        exitCode: 2,
      });
  });
});

describe("where the command was typed (099)", () => {
  it("prefers the Docker stand-in's folder, then pnpm's INIT_CWD, then its own", async () => {
    const { callerCwd } = await import("./run-backup");
    expect(callerCwd({ RONNE_CALLER_CWD: "/a", INIT_CWD: "/b" }, "/c")).toBe("/a");
    expect(callerCwd({ INIT_CWD: "/b", PWD: "/d" }, "/c")).toBe("/b");
    expect(callerCwd({ PWD: "/d" }, "/c")).toBe("/c");
  });
});
