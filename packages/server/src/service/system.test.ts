import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { realSystem } from "./system.js";

const dir = mkdtempSync(join(tmpdir(), "rmk-system-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const mode = (path: string) => statSync(path).mode & 0o777;

describe("the real system's files (083)", () => {
  it("gives only the folder its mode; parents it makes stay enterable", () => {
    // A 750 /usr/local/var, made on the way to the data folder, kept a --user service out (macOS).
    const leaf = join(dir, "usr", "local", "var", "rmk-server");
    realSystem().mkdir(leaf, 0o750);
    expect(mode(leaf)).toBe(0o750);
    expect(mode(join(dir, "usr", "local", "var")) & 0o055).toBe(0o055);
  });

  it("writes a file with its mode, replacing what was there", () => {
    const path = join(dir, "env");
    const sys = realSystem();
    sys.writeFile(path, "A=1\n", 0o644);
    sys.writeFile(path, "A=2\n", 0o600);
    expect(sys.readFile(path)).toBe("A=2\n");
    expect(mode(path)).toBe(0o600);
  });
});

describe("the real system's sameFile (099)", () => {
  it("knows a folder by a link, by another case where the disk ignores it, and not a missing one", () => {
    const real = join(dir, "real-data");
    mkdirSync(real);
    const link = join(dir, "link-to-data");
    symlinkSync(real, link, "dir");
    const sys = realSystem();
    expect(sys.sameFile(link, real)).toBe(true);
    expect(sys.sameFile(join(dir, "real-data", "..", "real-data"), real)).toBe(true);
    // macOS's disks ignore case; Linux's don't.
    expect(sys.sameFile(join(dir, "REAL-DATA"), real)).toBe(process.platform !== "linux");
    expect(sys.sameFile(join(dir, "other"), real)).toBe(false);
    expect(sys.sameFile(join(dir, "nothing"), join(dir, "nothing"))).toBe(false);
  });
});
