import { spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkStorageNames } from "./storage-names";

const dir = mkdtempSync(join(tmpdir(), "ronne-storage-names-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** What this disk does with two names, asked directly: one file, or two. */
const sameOnThisDisk = (a: string, b: string) => {
  const at = mkdtempSync(join(dir, "ask-"));
  try {
    writeFileSync(join(at, a), "");
    closeSync(openSync(join(at, b), "wx"));
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return true;
    throw error;
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
};

const storage = (...keys: string[]) => keys.map((k) => `storage/${k}`);

describe("stored names tried on the storage's disk (099)", () => {
  it("refuses exactly the pairs this disk takes for one name, and leaves nothing behind", async () => {
    const near = mkdtempSync(join(dir, "near-"));
    const root = join(near, "storage");
    const pairs: [string, string][] = [
      ["a.tgz", "A.tgz"],
      ["straße.tgz", "STRASSE.tgz"],
      ["σ.tgz", "ς.tgz"],
      ["ı.tgz", "i.tgz"],
      ["café.tgz", "café.tgz"],
      // Composed differently: ᾼ͂ (Α, ͂, ͅ) and ᾷ fold to one name on APFS.
      ["ᾼ͂.tgz", "ᾷ.tgz"],
    ];
    for (const [a, b] of pairs) {
      const { problem, leftover } = await checkStorageNames(
        storage(`acme/${a}`, `acme/${b}`),
        root,
      );
      expect(leftover, a).toBeUndefined();
      if (sameOnThisDisk(a, b))
        expect(problem, a).toEqual({
          kind: "same",
          a: `storage/acme/${a}`,
          b: `storage/acme/${b}`,
        });
      else expect(problem, a).toBeUndefined();
    }
    // A file and a folder of one name.
    const folder = await checkStorageNames(storage("acme", "ACME/x.tgz"), root);
    expect(folder.problem).toEqual(
      sameOnThisDisk("acme", "ACME")
        ? { kind: "same", a: "storage/acme", b: "storage/ACME/x.tgz" }
        : undefined,
    );
    expect(readdirSync(near)).toEqual([]);
  });

  it("refuses a name no disk holds, lets folders spelt two ways merge, and takes Ronne's keys", async () => {
    const root = join(mkdtempSync(join(dir, "near-")), "storage");
    // Longer than any disk's 255 bytes for one name (a storage key may be 512).
    const long = `acme/${"x".repeat(300)}.tgz`;
    expect((await checkStorageNames(storage(long), root)).problem).toEqual({
      kind: "unmade",
      b: `storage/${long}`,
      code: "ENAMETOOLONG",
    });
    expect(
      (await checkStorageNames(storage("Acme/a.tgz", "acme/b.tgz"), root)).problem,
    ).toBeUndefined();
    const keys = Array.from({ length: 2000 }, (_, i) => `scope-${i % 40}/item-${i}/1.0.${i}.tgz`);
    expect(
      await checkStorageNames([...storage(...keys), "database/user/000001.jsonl"], root),
    ).toEqual({});
  });

  it("tries them in the storage folder itself and puts it back as it was", async () => {
    const near = mkdtempSync(join(dir, "near-"));
    const root = join(near, "storage");
    mkdirSync(root);
    writeFileSync(join(root, "kept"), "");
    expect(await checkStorageNames(storage("acme/a.tgz", "b/c/d.tgz"), root)).toEqual({});
    expect(readdirSync(root)).toEqual(["kept"]);
    // Not there yet: made on the way, and gone again, with the folders made for it.
    const deep = join(near, "data", "storage");
    expect(await checkStorageNames(storage("acme/a.tgz"), deep)).toEqual({});
    expect(readdirSync(near)).toEqual(["storage"]);
  });

  // As root, permissions don't stop anything.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "refuses a storage folder it can't write, and not one whose parent it can't",
    async () => {
      const near = mkdtempSync(join(dir, "near-"));
      const root = join(near, "storage");
      mkdirSync(root);
      chmodSync(near, 0o555);
      try {
        expect(await checkStorageNames(storage("acme/a.tgz"), root)).toEqual({});
      } finally {
        chmodSync(near, 0o755);
      }
      chmodSync(root, 0o555);
      try {
        expect((await checkStorageNames(storage("acme/a.tgz"), root)).problem).toEqual({
          kind: "unmade",
          b: "storage/acme/a.tgz",
          code: "EACCES",
        });
      } finally {
        chmodSync(root, 0o755);
      }
      expect(readdirSync(root)).toEqual([]);
    },
  );

  it("removes only what it made: a ._ file already beside a folder it made stays", async () => {
    const near = mkdtempSync(join(dir, "near-"));
    writeFileSync(join(near, "._x"), "someone's");
    const root = join(near, "x", "y", "storage");
    expect(await checkStorageNames(storage("acme/a.tgz"), root)).toEqual({});
    expect(readdirSync(near).sort()).toEqual(["._x"]);
  });

  it("names a dangling link's error as it is, not as a clash of the backup's names", async () => {
    const near = mkdtempSync(join(dir, "near-"));
    symlinkSync(join(near, "gone"), join(near, "storage"));
    const { problem } = await checkStorageNames(storage("acme/a.tgz"), join(near, "storage"));
    expect(problem).toMatchObject({ kind: "unmade", b: "storage/acme/a.tgz" });
  });

  it.skipIf(process.platform === "win32")(
    "removes what it made when a signal stops it, and exits with the signal's code",
    async () => {
      const near = mkdtempSync(join(dir, "near-"));
      const root = join(near, "storage");
      const script = join(near, "run.mts");
      writeFileSync(
        script,
        `import { checkStorageNames } from ${JSON.stringify(join(import.meta.dirname, "storage-names.ts"))};
const keys = Array.from({ length: 200000 }, (_, i) => \`storage/s\${i % 50}/f\${i}.tgz\`);
await checkStorageNames(keys, ${JSON.stringify(root)});`,
      );
      const child = spawn(process.execPath, ["--import", "tsx", script], { stdio: "ignore" });
      for (let i = 0; i < 400 && !existsSync(join(root, "s49")); i++)
        await new Promise((r) => setTimeout(r, 25));
      expect(existsSync(join(root, "s49")), "the run started").toBe(true);
      child.kill("SIGINT");
      const code = await new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
      expect(code).toBe(130);
      expect(readdirSync(near)).toEqual(["run.mts"]);
    },
    30_000,
  );
});
