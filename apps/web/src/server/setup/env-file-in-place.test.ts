import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { InPlaceWriteError, writeEnvFile } from "./env-file";

// A disk that fills up while the file is rewritten in place (098): the write to an open file
// fails, or closing it does.
const failing = vi.hoisted(() => ({ write: true, close: false, folder: false, chmod: false }));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  const fail = (code: string) => Object.assign(new Error(`${code}: failed`), { code });
  return {
    ...fs,
    writeFileSync: (target: Parameters<typeof fs.writeFileSync>[0], ...rest: unknown[]) => {
      if (typeof target === "number" && failing.write) throw fail("ENOSPC");
      // A folder that can't take a new file (the service's /etc layout): the temporary file fails.
      if (typeof target === "string" && target.includes(".tmp-") && failing.folder)
        throw fail("EACCES");
      return (fs.writeFileSync as (...args: unknown[]) => void)(target, ...rest);
    },
    fchmodSync: (fd: number, mode: number) => {
      if (failing.chmod) throw fail("EPERM");
      fs.fchmodSync(fd, mode);
    },
    closeSync: (fd: number) => {
      fs.closeSync(fd);
      if (failing.close) throw fail("EIO");
    },
  };
});

const dir = mkdtempSync(join(tmpdir(), "ronne-in-place-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("writeEnvFile in place", () => {
  it("a write that fails once the file is open throws InPlaceWriteError with the code", () => {
    const path = join(dir, ".env");
    writeFileSync(path, "A=1\n");
    const failure = (() => {
      try {
        writeEnvFile(path, "A=2\n", "win32");
      } catch (error) {
        return error;
      }
    })();
    expect(failure).toBeInstanceOf(InPlaceWriteError);
    expect((failure as InPlaceWriteError).code).toBe("ENOSPC");
    expect((failure as InPlaceWriteError).complete).toBe(false);
    // The file was opened for writing, so it may be incomplete (here: empty).
    expect(readFileSync(path, "utf8")).toBe("");
    expect(readdirSync(dir)).toEqual([".env"]);
  });

  it("a failure to close the file after writing is reported the same way", () => {
    failing.write = false;
    failing.close = true;
    const path = join(dir, ".env");
    writeFileSync(path, "A=1\n");
    const failure = (() => {
      try {
        writeEnvFile(path, "A=2\n", "win32");
      } catch (error) {
        return error as InPlaceWriteError;
      }
    })();
    expect(failure).toBeInstanceOf(InPlaceWriteError);
    // A failed close can stand for a write the disk didn't finish: not complete.
    expect(failure?.complete).toBe(false);
  });

  it("written in full, then setting the mode fails: complete, with the new content in place", () => {
    failing.write = false;
    failing.close = false;
    failing.folder = true;
    failing.chmod = true;
    const path = join(dir, ".env");
    writeFileSync(path, "A=1\n");
    const failure = (() => {
      try {
        writeEnvFile(path, "A=3\n", "linux");
      } catch (error) {
        return error as InPlaceWriteError;
      }
    })();
    expect(failure).toBeInstanceOf(InPlaceWriteError);
    expect(failure?.complete).toBe(true);
    expect(failure?.code).toBe("EPERM");
    expect(readFileSync(path, "utf8")).toBe("A=3\n");
  });
});
