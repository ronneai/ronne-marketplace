import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTar } from "@ronneai/core/pack";
import { type Kysely, sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "../db/create-db";
import { toDbDate } from "../db/dates";
import { MIGRATION_TABLE, migrateToLatest } from "../db/migrate";
import { GLOBAL_WORKSPACE_ID } from "../db/migrations/0019_workspaces";
import { createTestDb } from "../db/testing/test-db";
import type { DatabaseDialect } from "../db/url";
import { createRoot } from "../domains/identity/actions/root-account";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { UNFILTERED } from "../domains/workspaces/models/viewer";
import type { BackupManifest } from "./archive";
import { createOpener, passphraseBytes } from "./crypto";
import {
  BackupFailedError,
  type BackupLog,
  keepNewest,
  type OpenOutput,
  openFileOutput,
  runBackup,
} from "./run-backup";

// Runs on the database in TEST_DATABASE_URL (SQLite by default; 004 runs all of them). The backup
// opens its own connection from the settings file, so SQLite gets a file rather than memory.
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

type TarEntry = Parameters<Parameters<typeof readTar>[1]>[0];

const NOW = new Date("2026-10-12T15:31:02.123Z");
const NAME = "ronne-backup-20261012-153102.tar";
const posix = process.platform !== "win32";

type Instance = {
  db: Db;
  dialect: DatabaseDialect;
  url: string;
  /** The app folder: the settings file is its `.env`, the default backups go in `data/backups`. */
  appDir: string;
  storage: string;
  artifact: Uint8Array;
};

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/** A migrated database, an app folder with a settings file, and a storage folder. */
const instance = async (): Promise<Instance> => {
  const appDir = mkdtempSync(join(tmpdir(), "ronne-backup-"));
  cleanups.push(() => rmSync(appDir, { recursive: true, force: true }));
  let t = await createTestDb();
  cleanups.push(t.cleanup);
  if (t.url === "file::memory:") {
    const url = `file:${join(appDir, "ronne.db")}`;
    const { db } = createDb(url);
    await migrateToLatest(db, "sqlite");
    cleanups.push(() => db.destroy());
    t = { ...t, db, url };
  }
  const storage = join(appDir, "storage");
  const artifact = new TextEncoder().encode("the 1.0.0 artifact's bytes");
  writeFileSync(
    join(appDir, ".env"),
    `DATABASE_URL=${t.url}\nAUTH_SECRET=${"s".repeat(43)}\nSTORAGE_PATH=${storage}\nPUBLIC_URL=http://localhost:3000\n`,
    { mode: 0o600 },
  );
  return { db: t.db, dialect: t.dialect, url: t.url, appDir, storage, artifact };
};

/** Root, a scope and an item with two released versions; only 1.0.0's artifact is stored. */
const seed = async (i: Instance) => {
  const { id: rootId } = await createRoot(i.db, i.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  await i.db
    .insertInto("scopes")
    .values({
      id: "scope-1",
      name: "incident",
      description: "Items for the backup test.",
      created_by: rootId,
      created_at: toDbDate(NOW, i.dialect),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
  const items = kyselyItemRepository(i.db, i.dialect, UNFILTERED);
  await items.transaction(async (repo) => {
    const itemId = await repo.insertItem({
      scopeId: "scope-1",
      name: "notes",
      type: "skill",
      description: "Release notes that say why.",
      ownerId: rootId,
      createdAt: NOW,
    });
    for (const version of ["1.0.0", "1.1.0"])
      await repo.insertVersion({
        itemId,
        version,
        manifest: { name: "@incident/notes", type: "skill", description: "Notes.", version },
        readme: null,
        files: [{ path: "SKILL.md", size: 10, executable: false }],
        notes: null,
        artifactPath: `incident/notes/${version}.tgz`,
        sha256: sha256(version === "1.0.0" ? i.artifact : "never stored"),
        size: 1024,
        publishedBy: rootId,
        publishedAt: NOW,
        submissionId: null,
        dependencies: [],
        riskFlags: [],
      });
  });
  mkdirSync(join(i.storage, "incident", "notes"), { recursive: true });
  writeFileSync(join(i.storage, "incident", "notes", "1.0.0.tgz"), i.artifact);
  mkdirSync(join(i.storage, "feeds", "claude-code"), { recursive: true });
  writeFileSync(join(i.storage, "feeds", "claude-code", "plugin.zip"), "zip bytes");
  // A put in progress (local-storage.ts) and, where links can be made, a link: both left out.
  writeFileSync(join(i.storage, "incident", "notes", "1.2.0.tgz.0123456789ab.tmp"), "half");
  if (posix) symlinkSync("/etc/hosts", join(i.storage, "link.tgz"));
};

const logs = () => {
  const lines: { level: "info" | "warn"; message: string }[] = [];
  const log: BackupLog = {
    info: (message) => lines.push({ level: "info", message }),
    warn: (message) => lines.push({ level: "warn", message }),
  };
  return { lines, log, text: () => lines.map((l) => l.message).join("\n") };
};

const backup = (i: Instance, options: Partial<Parameters<typeof runBackup>[0]> = {}) =>
  runBackup({
    appDir: i.appDir,
    env: {},
    callerCwd: i.appDir,
    settings: true,
    log: logs().log,
    now: () => NOW,
    ...options,
  });

const entriesOf = (path: string) => {
  const entries: TarEntry[] = [];
  readTar(new Uint8Array(readFileSync(path)), (entry) => entries.push(entry));
  return entries;
};

const jsonOf = <T>(entries: TarEntry[], path: string) =>
  JSON.parse(new TextDecoder().decode(entries.find((e) => e.path === path)?.bytes)) as T;

const backupEvents = async (i: Instance) =>
  i.db
    .selectFrom("audit_log")
    .select(["actor_id", "target_type", "metadata"])
    .where("action", "=", "instance.backup_made")
    .execute();

describe("rmk-server backup (099)", () => {
  it("writes the database, storage, settings and manifest into one checked archive", async () => {
    const i = await instance();
    await seed(i);
    const { lines, log } = logs();
    const result = await backup(i, { log });

    const dir = join(i.appDir, "data", "backups");
    expect(result.path).toBe(join(dir, NAME));
    expect(readdirSync(dir)).toEqual([NAME]);
    if (posix) {
      expect(statSync(dir).mode & 0o777).toBe(0o700);
      expect(statSync(result.path).mode & 0o777).toBe(0o600);
    }
    expect(statSync(result.path).size).toBe(result.bytes);

    const entries = entriesOf(result.path);
    const paths = entries.map((e) => e.path);
    // The format's order: backup.json, the database, storage, the settings, the manifest.
    expect(paths[0]).toBe("backup.json");
    expect(paths.at(-1)).toBe("manifest.json");
    expect(paths.at(-2)).toBe("settings.env");
    const firstStorage = paths.findIndex((p) => p.startsWith("storage/"));
    const lastDatabase = paths.findLastIndex((p) => p.startsWith("database/"));
    expect(lastDatabase).toBeLessThan(firstStorage);
    expect(paths.filter((p) => p.startsWith("storage/"))).toEqual([
      "storage/feeds/claude-code/plugin.zip",
      "storage/incident/notes/1.0.0.tgz",
    ]);

    const info = jsonOf<Record<string, unknown>>(entries, "backup.json");
    const { rows: applied } = await sql<{ name: string }>`
      select name from ${sql.table(MIGRATION_TABLE)}`.execute(i.db);
    expect(info).toEqual({
      format: 1,
      ronne: expect.stringMatching(/^\d+\.\d+\.\d+/),
      createdAt: NOW.toISOString(),
      dialect: i.dialect,
      migrations: applied.map((r) => r.name).sort(),
    });

    const manifest = jsonOf<BackupManifest>(entries, "manifest.json");
    // Every entry between the first and the last, with its size and sha256, and nothing else.
    expect(Object.keys(manifest.files).sort()).toEqual(paths.slice(1, -1).sort());
    for (const entry of entries.slice(1, -1))
      expect(manifest.files[entry.path], entry.path).toEqual({
        size: entry.bytes.length,
        sha256: sha256(entry.bytes),
      });
    expect(new TextDecoder().decode(entries.at(-2)?.bytes)).toBe(
      readFileSync(join(i.appDir, ".env"), "utf8"),
    );
    expect(manifest.storage).toEqual({
      files: 2,
      bytes: i.artifact.length + "zip bytes".length,
    });
    expect(manifest.settings).toEqual({ included: true, environmentOnly: [] });
    expect(manifest.missingArtifacts).toEqual([
      { item: "@incident/notes", version: "1.1.0", path: "incident/notes/1.1.0.tgz" },
    ]);
    expect(manifest.tables.item_versions?.rows).toBe(2);
    expect(manifest.tables.user?.rows).toBe(1);
    expect(result.archive.skipped.map((s) => s.path).sort()).toEqual(
      posix
        ? ["incident/notes/1.2.0.tgz.0123456789ab.tmp", "link.tgz"]
        : ["incident/notes/1.2.0.tgz.0123456789ab.tmp"],
    );

    // What it says: where, the counts, that the settings are sensitive, the missing artifact.
    const text = lines.map((l) => l.message).join("\n");
    expect(text).toContain(`Wrote ${result.path}`);
    expect(text).toMatch(/\d+ rows in \d+ tables, 2 stored files/);
    expect(text).toContain("AUTH_SECRET and the database's password");
    expect(text).toContain("@incident/notes 1.1.0 (incident/notes/1.1.0.tgz)");
    expect(text).not.toContain("s".repeat(43));

    // Audited after the snapshot, so not in this archive's own audit_log.
    const events = await backupEvents(i);
    expect(events).toHaveLength(1);
    expect(events[0]?.actor_id).toBeNull();
    expect(JSON.parse(String(events[0]?.metadata))).toEqual({
      via: "cli",
      tables: Object.keys(manifest.tables).length,
      rows: Object.values(manifest.tables).reduce((sum, t) => sum + t.rows, 0),
      files: 2,
      bytes: result.bytes,
      encrypted: false,
      settings: true,
    });
  });

  it("writes to --out, from where the command was typed, and never inside storage", async () => {
    const i = await instance();
    const result = await backup(i, { callerCwd: join(i.appDir, "here"), out: "../elsewhere/b" });
    expect(result.path).toBe(join(i.appDir, "elsewhere", "b", NAME));
    if (posix) expect(statSync(join(i.appDir, "elsewhere", "b")).mode & 0o777).toBe(0o700);

    for (const out of [i.storage, join(i.storage, "backups")])
      await expect(backup(i, { out })).rejects.toThrow(/inside the storage folder/);
    if (posix) {
      // The same folder through a link.
      mkdirSync(i.storage, { recursive: true });
      symlinkSync(i.storage, join(i.appDir, "storage-link"));
      await expect(backup(i, { out: join(i.appDir, "storage-link", "x") })).rejects.toThrow(
        /inside the storage folder/,
      );
    }
    expect(existsSync(join(i.storage, "backups"))).toBe(false);

    // A storage folder that isn't there yet, named in another case: the same folder on macOS's
    // disks (by default).
    if (process.platform === "darwin") {
      const j = await instance();
      const upper = join(j.appDir, "STORE");
      writeFileSync(
        join(j.appDir, ".env"),
        `DATABASE_URL=${j.url}\nAUTH_SECRET=${"s".repeat(43)}\nSTORAGE_PATH=${upper}\n`,
      );
      await expect(backup(j, { out: join(j.appDir, "store", "b") })).rejects.toThrow(
        /inside the storage folder/,
      );
    }
    // As macOS's disk (APFS) compares names: Unicode forms and full case folding.
    if (process.platform === "darwin") {
      const j = await instance();
      for (const [storage, out] of [
        ["Straße", "STRASSE"],
        ["Caf\u00e9", "cafe\u0301"],
        ["σοφος", "ΣΟΦΟΣ"],
        ["\u1e9e", "SS"],
        ["\u1e9e", "\u00df"],
      ]) {
        writeFileSync(
          join(j.appDir, ".env"),
          `DATABASE_URL=${j.url}\nAUTH_SECRET=${"s".repeat(43)}\nSTORAGE_PATH=${join(j.appDir, storage as string)}\n`,
        );
        await expect(
          backup(j, { out: join(j.appDir, out as string, "b") }),
          `${storage} / ${out}`,
        ).rejects.toThrow(/inside the storage folder/);
        // The folders made to find out are gone again, storage's included.
        expect(readdirSync(j.appDir).sort(), `${storage} / ${out}`).toEqual(
          [".env", "ronne.db", "ronne.db-shm", "ronne.db-wal"].filter((n) =>
            existsSync(join(j.appDir, n)),
          ),
        );
      }
    }
  });

  it("leaves the settings out with --no-settings, and names settings only the environment has", async () => {
    const i = await instance();
    const { log, text } = logs();
    const result = await backup(i, {
      settings: false,
      // The same DATABASE_URL as the file isn't environment-only; another AUTH_SECRET is.
      env: { DATABASE_URL: i.url, AUTH_SECRET: "t".repeat(43), TRUST_PROXY: "true" },
      log,
    });
    const entries = entriesOf(result.path);
    expect(entries.map((e) => e.path)).not.toContain("settings.env");
    // No storage folder yet: no storage entries.
    expect(entries.some((e) => e.path.startsWith("storage/"))).toBe(false);
    const manifest = jsonOf<BackupManifest>(entries, "manifest.json");
    expect(manifest.settings).toEqual({
      included: false,
      environmentOnly: ["AUTH_SECRET", "TRUST_PROXY"],
    });
    expect(manifest.storage).toEqual({ files: 0, bytes: 0 });
    expect(text()).toContain("--no-settings");
    expect(text()).toContain(
      "AUTH_SECRET and TRUST_PROXY come from the environment and aren't in this backup",
    );
    expect(text()).not.toContain("t".repeat(43));
    const [event] = await backupEvents(i);
    expect(JSON.parse(String(event?.metadata)).settings).toBe(false);
  });

  it("removes the partial archive when the disk fills, and changes nothing else", async () => {
    const i = await instance();
    await seed(i);
    const dir = join(i.appDir, "data", "backups");
    mkdirSync(dir, { recursive: true });
    const older = ["ronne-backup-20261010-010000.tar", "ronne-backup-20261011-010000.tar"];
    for (const name of older) writeFileSync(join(dir, name), "an older backup");
    let written = 0;
    // The real file, until 3 KiB are written: then the disk is full.
    const full: OpenOutput = async (path) => {
      const real = await openFileOutput(path);
      return {
        ...real,
        write: async (chunk) => {
          written += chunk.length;
          if (written > 3 * 1024)
            throw Object.assign(new Error("ENOSPC: no space left on device, write"), {
              code: "ENOSPC",
            });
          await real.write(chunk);
        },
      };
    };
    const error = await backup(i, { openOutput: full, keep: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackupFailedError);
    expect((error as Error).message).toMatch(/the disk is full \(ENOSPC\)/);
    expect((error as Error).message).toMatch(/partial archive was removed/);
    // Only the older archives, untouched: no partial file, and --keep didn't run.
    expect(readdirSync(dir).sort()).toEqual(older);
    expect(await backupEvents(i)).toHaveLength(0);
    // Folders it made for the archive go too.
    written = 0;
    await expect(
      backup(i, { openOutput: full, out: join(i.appDir, "new", "deep") }),
    ).rejects.toThrow(/the disk is full/);
    expect(existsSync(join(i.appDir, "new"))).toBe(false);

    // A failure in the database half too: the snapshot's error, the same clean-up.
    const failing: OpenOutput = async (path) => {
      const real = await openFileOutput(path);
      return { ...real, sync: async () => Promise.reject(new Error("The device went away.")) };
    };
    await expect(backup(i, { openOutput: failing })).rejects.toThrow(
      /The backup failed: The device went away\. The partial archive was removed/,
    );
    expect(readdirSync(dir).sort()).toEqual(older);
  });

  it("--keep removes only the oldest ronne-backup archives beyond n, never the new one", async () => {
    const i = await instance();
    const dir = join(i.appDir, "data", "backups");
    mkdirSync(dir, { recursive: true });
    const archives = [
      "ronne-backup-20261009-120000.tar",
      "ronne-backup-20261010-120000.tar.enc",
      "ronne-backup-20261011-120000.tar",
      "ronne-backup-20261012-120000.tar",
    ];
    const others = [
      "notes.txt",
      "ronne-backup-notes.tar",
      "ronne-backup-20261001-000000.tar.partial",
      "my-ronne-backup-20261001-000000.tar",
    ];
    for (const name of [...archives, ...others]) writeFileSync(join(dir, name), name);
    // A folder and a link with an archive's name aren't archives.
    mkdirSync(join(dir, "ronne-backup-20261001-000001.tar"));
    if (posix) symlinkSync(join(dir, "notes.txt"), join(dir, "ronne-backup-20261001-000002.tar"));
    const kept = readdirSync(dir).filter((n) => !archives.includes(n));

    const { log, text } = logs();
    const result = await backup(i, { keep: 3, log });
    expect(result.removed).toEqual([
      "ronne-backup-20261010-120000.tar.enc",
      "ronne-backup-20261009-120000.tar",
    ]);
    expect(readdirSync(dir).sort()).toEqual(
      [
        ...kept,
        NAME,
        "ronne-backup-20261011-120000.tar",
        "ronne-backup-20261012-120000.tar",
      ].sort(),
    );
    expect(text()).toContain("Removed 2 older archives (--keep 3).");

    // An archive named later than now (the clock went back) is older for --keep: the new one stays.
    writeFileSync(join(dir, "ronne-backup-20991231-000000.tar"), "from the future");
    const later = new Date(NOW.getTime() + 60_000);
    const second = await backup(i, { keep: 1, now: () => later });
    expect(readdirSync(dir).sort()).toEqual([...kept, "ronne-backup-20261012-153202.tar"].sort());
    expect(second.removed).toContain("ronne-backup-20991231-000000.tar");

    // --keep larger than what's there removes nothing.
    const third = await backup(i, { keep: 10_000, now: () => new Date(later.getTime() + 60_000) });
    expect(third.removed).toEqual([]);
  });

  it("refuses an instance that isn't set up, and an archive that's already there", async () => {
    const i = await instance();
    writeFileSync(join(i.appDir, ".env"), "PUBLIC_URL=http://localhost:3000\n");
    await expect(backup(i)).rejects.toThrow(/isn't set up yet/);
    expect(existsSync(join(i.appDir, "data"))).toBe(false);

    const j = await instance();
    await backup(j);
    await expect(backup(j)).rejects.toThrow(/already exists/);
    expect(readdirSync(join(j.appDir, "data", "backups"))).toEqual([NAME]);
  });

  it("leaves nothing behind for a database it can't open, or an --out it can't look at", async () => {
    const i = await instance();
    writeFileSync(
      join(i.appDir, ".env"),
      `DATABASE_URL=bogus://alex:hunter2@db/x\nSTORAGE_PATH=${i.storage}\n`,
    );
    const error = await backup(i).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackupFailedError);
    expect((error as Error).message).toMatch(
      /The database couldn't be opened: .*Nothing was written/s,
    );
    expect((error as Error).message).not.toContain("hunter2");
    expect(existsSync(join(i.appDir, "data", "backups"))).toBe(false);

    // A server that refuses the connection: refused before the archive's file exists.
    writeFileSync(
      join(i.appDir, ".env"),
      `DATABASE_URL=postgres://alex:hunter2@127.0.0.1:1/x\nSTORAGE_PATH=${i.storage}\n`,
    );
    let opened = false;
    const watched: OpenOutput = async (path) => {
      opened = true;
      return openFileOutput(path);
    };
    const refused = await backup(i, { openOutput: watched }).catch((e: unknown) => e);
    // Refused before the archive's file was made, not cleaned up after.
    expect(opened).toBe(false);
    expect((refused as Error).message).toMatch(
      /The database couldn't be opened: .*Nothing was written/s,
    );
    expect((refused as Error).message).not.toContain("hunter2");
    expect(existsSync(join(i.appDir, "data", "backups"))).toBe(false);

    // A settings file it can't read (a schedule run as the wrong account), on POSIX.
    if (posix && process.getuid?.() !== 0) {
      chmodSync(join(i.appDir, ".env"), 0o000);
      await expect(backup(i)).rejects.toThrow(/The settings file couldn't be read \(EACCES\)/);
      chmodSync(join(i.appDir, ".env"), 0o600);
    }

    // A path through a regular file: a worded refusal, not a stack trace.
    writeFileSync(join(i.appDir, "a-file"), "");
    await expect(backup(i, { out: join(i.appDir, "a-file", "sub") })).rejects.toThrow(
      BackupFailedError,
    );
  });

  it("never makes a SQLite file the settings name but that isn't there", async () => {
    const i = await instance();
    const missing = join(i.appDir, "nodir", "missing.db");
    writeFileSync(
      join(i.appDir, ".env"),
      `DATABASE_URL=file:${missing}\nSTORAGE_PATH=${i.storage}\n`,
    );
    await expect(backup(i)).rejects.toThrow(/SQLite database file that isn't there/);
    expect(existsSync(join(i.appDir, "nodir"))).toBe(false);
    expect(existsSync(join(i.appDir, "data", "backups"))).toBe(false);
  });

  it("removes the partial archive when stopped by a signal, and exits as the signal says", async () => {
    const i = await instance();
    const dir = join(i.appDir, "data", "backups");
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    cleanups.push(() => exit.mockRestore());
    const before = process.listenerCount("SIGTERM");
    let sent = false;
    // The first write lands, then SIGTERM arrives (a schedule's time limit).
    const stopped: OpenOutput = async (path) => {
      const real = await openFileOutput(path);
      return {
        ...real,
        write: async (chunk) => {
          await real.write(chunk);
          if (!sent) {
            sent = true;
            expect(existsSync(path)).toBe(true);
            process.emit("SIGTERM", "SIGTERM");
          }
        },
      };
    };
    const { log, text } = logs();
    await expect(backup(i, { openOutput: stopped, removeOnSignal: true, log })).rejects.toThrow(
      BackupFailedError,
    );
    expect(exit).toHaveBeenCalledWith(143);
    expect(text()).toContain("Stopped (SIGTERM): the partial archive was removed.");
    expect(existsSync(dir)).toBe(false);
    // Its handlers are gone afterwards, after a success too.
    expect(process.listenerCount("SIGTERM")).toBe(before);
    await backup(i, { removeOnSignal: true });
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });

  it.skipIf(!posix)("escapes control characters in the names it prints", async () => {
    const i = await instance();
    mkdirSync(i.storage, { recursive: true });
    writeFileSync(join(i.storage, "evil\u001b[2Jname"), "x");
    const { log, text } = logs();
    const result = await backup(i, { log });
    expect(result.archive.skipped.map((s) => s.path)).toEqual(["evil\u001b[2Jname"]);
    expect(text()).toContain("Left out of the backup: storage/evil\\x1b[2Jname");
    expect(text()).not.toContain("\u001b");
  });

  it("counts STORAGE_PATH the same folder however it's written", async () => {
    const i = await instance();
    const { log, text } = logs();
    await backup(i, { env: { STORAGE_PATH: `${i.storage}/` }, log });
    expect(text()).not.toContain("come from the environment");
    expect(text()).not.toContain("comes from the environment");
  });

  it("archives the settings file byte for byte, and reads settings as the server does", async () => {
    const i = await instance();
    // A Latin-1 byte in a comment: not UTF-8, kept as it is.
    const settings = join(i.appDir, ".env");
    writeFileSync(
      settings,
      Buffer.concat([
        readFileSync(settings),
        Buffer.from([0x23, 0x20, 0x63, 0x61, 0x66, 0xe9, 0x0a]),
      ]),
    );
    // The environment wins over the file, and an empty variable counts as unset.
    const other = join(i.appDir, "other-storage");
    mkdirSync(other);
    writeFileSync(join(other, "only-here.bin"), "x");
    const result = await backup(i, { env: { DATABASE_URL: "", STORAGE_PATH: other } });
    const entries = entriesOf(result.path);
    expect(Buffer.from(entries.find((e) => e.path === "settings.env")?.bytes ?? [])).toEqual(
      readFileSync(settings),
    );
    expect(entries.map((e) => e.path)).toContain("storage/only-here.bin");
  });

  it("--encrypt writes the archive sealed with the passphrase, as .tar.enc", async () => {
    const i = await instance();
    await seed(i);
    const secret = "a passphrase nobody else knows";
    const { log, text } = logs();
    const result = await backup(i, { passphrase: passphraseBytes(secret), log });
    expect(result.path).toBe(join(i.appDir, "data", "backups", NAME.replace(".tar", ".tar.enc")));
    const sealed = readFileSync(result.path);
    expect(sealed.subarray(0, 8).toString("ascii")).toBe("RONNEBAK");
    expect(sealed.length).toBe(result.bytes);
    if (posix) expect(statSync(result.path).mode & 0o777).toBe(0o600);
    // Inside: the same tar a plain backup writes.
    const plain: Buffer[] = [];
    const opener = createOpener(passphraseBytes(secret), (bytes) => {
      plain.push(Buffer.from(bytes));
    });
    await opener.push(sealed);
    await opener.end();
    const entries: TarEntry[] = [];
    readTar(new Uint8Array(Buffer.concat(plain)), (entry) => entries.push(entry));
    expect(entries[0]?.path).toBe("backup.json");
    expect(entries.at(-1)?.path).toBe("manifest.json");
    expect(entries.map((e) => e.path)).toContain("storage/incident/notes/1.0.0.tgz");
    expect(entries.map((e) => e.path)).toContain("settings.env");
    // Without it, nothing opens.
    const wrong = createOpener(passphraseBytes("a guess"), () => undefined);
    await expect(wrong.push(sealed).then(() => wrong.end())).rejects.toThrow(
      /damaged, or the passphrase is wrong/,
    );
    // Said, audited, and the passphrase nowhere.
    expect(text()).toContain("It's encrypted");
    expect(text()).toContain("a lost passphrase can't be recovered");
    // Still sensitive, and said; no --encrypt hint on an encrypted archive.
    expect(text()).toContain("AUTH_SECRET and the database's password");
    expect(text()).not.toContain("use --encrypt");
    expect(text()).not.toContain(secret);
    const [event] = await backupEvents(i);
    expect(JSON.parse(String(event?.metadata)).encrypted).toBe(true);
    expect(String(event?.metadata)).not.toContain(secret);
  });

  it("warns about an artifact stored with another sha256, and still completes", async () => {
    const i = await instance();
    await seed(i);
    writeFileSync(join(i.storage, "incident", "notes", "1.0.0.tgz"), "damaged on disk");
    const { log, lines } = logs();
    const result = await backup(i, { log });
    expect(existsSync(result.path)).toBe(true);
    expect(result.archive.alteredArtifacts).toEqual([
      { item: "@incident/notes", version: "1.0.0", path: "incident/notes/1.0.0.tgz" },
    ]);
    expect(lines).toContainEqual({
      level: "warn",
      message: expect.stringContaining(
        "the artifact of 1 released version has another sha256 than the database records",
      ),
    });
  });

  it.skipIf(!posix || process.getuid?.() === 0)(
    "--keep names what it can't remove, and the backup still succeeds",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "ronne-keep-"));
      cleanups.push(() => {
        chmodSync(dir, 0o700);
        rmSync(dir, { recursive: true, force: true });
      });
      for (const name of ["ronne-backup-20261010-010000.tar", "ronne-backup-20261011-010000.tar"])
        writeFileSync(join(dir, name), name);
      // A folder whose entries can't be removed.
      chmodSync(dir, 0o500);
      const { log, lines } = logs();
      expect(await keepNewest(dir, NAME, 1, log)).toEqual([]);
      expect(lines.filter((l) => l.level === "warn").map((l) => l.message)).toEqual([
        expect.stringMatching(
          /^--keep couldn't remove ronne-backup-20261011-010000\.tar: .*EACCES/,
        ),
        expect.stringMatching(
          /^--keep couldn't remove ronne-backup-20261010-010000\.tar: .*EACCES/,
        ),
      ]);
      // A folder it can't list: nothing removed, and said.
      chmodSync(dir, 0o000);
      const second = logs();
      expect(await keepNewest(dir, NAME, 1, second.log)).toEqual([]);
      expect(second.text()).toMatch(/--keep couldn't list .* so it removed nothing/);
    },
  );

  it.skipIf(!(process.env.TEST_DATABASE_URL ?? "file:").startsWith("file:"))(
    "completes when the audit log can't record it, and says so",
    async () => {
      const i = await instance();
      await sql`create trigger no_audit before insert on audit_log
        begin select raise(abort, 'the audit log is down'); end`.execute(i.db);
      const { log, text } = logs();
      const result = await backup(i, { log });
      expect(existsSync(result.path)).toBe(true);
      expect(text()).toMatch(
        /The backup is complete, but recording it in the audit log failed: the audit log is down/,
      );
    },
  );

  it.skipIf((process.env.TEST_DATABASE_URL ?? "file:").startsWith("file:"))(
    "waits for a migration that's running before taking its snapshot",
    async () => {
      const i = await instance();
      // Another connection holds the migration lock, as a starting server's migrations do.
      const { db: other } = createDb(i.url);
      cleanups.push(() => other.destroy());
      const adapter = other.getExecutor().adapter;
      const options = { lockTable: "ronne_migration_lock", lockRowId: "migration_lock" };
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = other.connection().execute(async (connection) => {
        await adapter.acquireMigrationLock(connection as Kysely<unknown>, options);
        await held;
        // A migration lands before the lock is released: the snapshot must see it.
        await sql`create table backup_lock_probe (id varchar(26) primary key)`.execute(connection);
        await adapter.releaseMigrationLock(connection as Kysely<unknown>, options);
      });
      cleanups.push(async () => {
        await sql`drop table if exists backup_lock_probe`.execute(i.db);
      });
      let settled = false;
      const running = backup(i).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(settled).toBe(false);
      release();
      await locked;
      const result = await running;
      const manifest = jsonOf<BackupManifest>(entriesOf(result.path), "manifest.json");
      expect(Object.keys(manifest.tables)).toContain("backup_lock_probe");
    },
  );
});
