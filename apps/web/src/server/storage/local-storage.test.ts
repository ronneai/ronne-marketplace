import { chmod, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../log/logger";
import { localStorage } from "./local-storage";
import { StorageConflictError, StorageKeyError } from "./storage-adapter";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ronne-storage-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const bytes = (text: string) => new TextEncoder().encode(text);

describe("localStorage", () => {
  it("stores and reads artifacts under their key", async () => {
    const storage = localStorage(root);
    await storage.put("team/secure-coding/1.0.0.tgz", bytes("one"));
    expect(await storage.get("team/secure-coding/1.0.0.tgz")).toEqual(bytes("one"));
    expect(await storage.exists("team/secure-coding/1.0.0.tgz")).toBe(true);
    expect(await storage.size("team/secure-coding/1.0.0.tgz")).toBe(3);
    expect((await stat(join(root, "team/secure-coding/1.0.0.tgz"))).isFile()).toBe(true);
  });

  it("says when nothing is stored", async () => {
    const storage = localStorage(root);
    expect(await storage.get("team/x/1.0.0.tgz")).toBeNull();
    expect(await storage.exists("team/x/1.0.0.tgz")).toBe(false);
    expect(await storage.size("team/x/1.0.0.tgz")).toBeNull();
  });

  it("accepts the same bytes again, and refuses different ones", async () => {
    const storage = localStorage(root);
    await storage.put("a/b/1.0.0.tgz", bytes("same"));
    await storage.put("a/b/1.0.0.tgz", bytes("same"));
    await expect(storage.put("a/b/1.0.0.tgz", bytes("other"))).rejects.toThrow(
      StorageConflictError,
    );
    expect(await storage.get("a/b/1.0.0.tgz")).toEqual(bytes("same"));
  });

  it("lets only one of two different concurrent puts win, and leaves no temporary files", async () => {
    const storage = localStorage(root);
    const results = await Promise.allSettled([
      storage.put("a/b/2.0.0.tgz", bytes("first")),
      storage.put("a/b/2.0.0.tgz", bytes("second")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await readdir(join(root, "a/b"))).toEqual(["2.0.0.tgz"]);
  });

  it("refuses keys that could escape the root", async () => {
    const storage = localStorage(root);
    for (const key of ["", "/etc/passwd", "../outside.tgz", "a/../../x", "a//b", "a/./b", "a\\b"])
      await expect(storage.put(key, bytes("x")), key).rejects.toThrow(StorageKeyError);
  });
});

describe("localStorage and the logs (feature 100)", () => {
  it.skipIf(process.getuid?.() === 0)(
    "a storage error logged as err names no item: its path is hidden",
    async () => {
      const storage = localStorage(root);
      await storage.put("team/secret-item/1.0.0.tgz", bytes("x"));
      await chmod(join(root, "team/secret-item/1.0.0.tgz"), 0o000);
      const error = await storage.get("team/secret-item/1.0.0.tgz").catch((e: unknown) => e);
      await chmod(join(root, "team/secret-item/1.0.0.tgz"), 0o644);
      expect(error).toBeInstanceOf(Error);
      const lines: string[] = [];
      const log = createLogger({
        level: "info",
        format: "json",
        write: (line) => lines.push(line),
      });
      log.error("Submit's checks failed", { err: error });
      log.event("submission.checks_failed", { err: error });
      expect(lines.join("")).toContain("[path]");
      expect(lines.join("")).not.toContain("secret-item");
      expect(lines.join("")).not.toContain("team/");
    },
  );
});
