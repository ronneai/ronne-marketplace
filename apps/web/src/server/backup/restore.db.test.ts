import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createTarWriter, readTar } from "@ronneai/core/pack";
import { type Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/create-db";
import { toDbDate } from "../db/dates";
import { readSchema } from "../db/introspect";
import { MIGRATION_TABLE, migrateToExactly, migrateToLatest } from "../db/migrate";
import { migrations } from "../db/migrations";
import { GLOBAL_WORKSPACE_ID } from "../db/migrations/0019_workspaces";
import {
  holdSqliteExclusively,
  tryWriteSqlite,
  writeJournalModeSqlite,
} from "../db/testing/sqlite-files";
import { createTestDb } from "../db/testing/test-db";
import { type DatabaseDialect, parseDatabaseUrl } from "../db/url";
import { createRoot } from "../domains/identity/actions/root-account";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { UNFILTERED } from "../domains/workspaces/models/viewer";
import { passphraseBytes } from "./crypto";
import { convertValue, isEmptyDatabase } from "./restore";
import { type BackupLog, runBackup } from "./run-backup";
import { RestoreFailedError, runRestore } from "./run-restore";

// Restores real archives into empty databases: this run's kind (TEST_DATABASE_URL; SQLite by
// default, PostgreSQL, MySQL and MariaDB in 004's runs) from a SQLite source, and a SQLite file
// from this run's kind, so every pair with SQLite is covered across the runs.
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const NOW = new Date("2026-10-12T15:31:02.123Z");
const KNOWN = Object.keys(migrations);
const ARTIFACT = new TextEncoder().encode("the 1.0.0 artifact");
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const quiet: BackupLog = { info: () => undefined, warn: () => undefined };
const onServer = !(process.env.TEST_DATABASE_URL ?? "file:").startsWith("file:");

const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "ronne-restore-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

type Source = { db: Db; dialect: DatabaseDialect; url: string; dir: string };

/** Root, a scope, an item with two versions (1.0.0's artifact stored) and a tag. */
const seed = async (db: Db, dialect: DatabaseDialect, dir: string) => {
  const { id: rootId } = await createRoot(db, dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  await db
    .insertInto("scopes")
    .values({
      id: "scope-1",
      name: "incident",
      description: "Items for the restore test: émoji 🚀 and quotes \"'.",
      created_by: rootId,
      created_at: toDbDate(NOW, dialect),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
  await kyselyItemRepository(db, dialect, UNFILTERED).transaction(async (repo) => {
    const itemId = await repo.insertItem({
      scopeId: "scope-1",
      name: "notes",
      type: "skill",
      description: "Notes.",
      ownerId: rootId,
      createdAt: NOW,
    });
    for (const version of ["1.0.0", "1.1.0"]) {
      const versionId = await repo.insertVersion({
        itemId,
        version,
        manifest: { name: "@incident/notes", type: "skill", description: "Notes.", version },
        readme: "# Notes\n",
        files: [{ path: "SKILL.md", size: 10, executable: false }],
        notes: null,
        artifactPath: `incident/notes/${version}.tgz`,
        sha256: sha256(version === "1.0.0" ? ARTIFACT : "never stored"),
        size: 1024,
        publishedBy: rootId,
        publishedAt: NOW,
        submissionId: null,
        dependencies: [],
        riskFlags: [],
      });
      await repo.setTag(itemId, version === "1.0.0" ? "stable" : "latest", versionId);
    }
  });
  mkdirSync(join(dir, "storage", "incident", "notes"), { recursive: true });
  writeFileSync(join(dir, "storage", "incident", "notes", "1.0.0.tgz"), ARTIFACT);
};

/** A SQLite file instance, migrated (to `upTo` migrations, or all) and seeded. */
const sqliteSource = async (upTo?: string[]): Promise<Source> => {
  const dir = tempDir();
  const url = `file:${join(dir, "source.db")}`;
  const { db } = createDb(url);
  cleanups.push(() => db.destroy());
  if (upTo) await migrateToExactly(db, "sqlite", upTo);
  else await migrateToLatest(db, "sqlite");
  writeFileSync(
    join(dir, ".env"),
    `DATABASE_URL=${url}\nAUTH_SECRET=${"s".repeat(43)}\nSTORAGE_PATH=${join(dir, "storage")}\nPUBLIC_URL=https://ronne.example.com\n`,
  );
  return { db, dialect: "sqlite", url, dir };
};

/** This run's kind, migrated and seeded (the shared test database). */
const testSource = async (): Promise<Source> => {
  const dir = tempDir();
  const t = await createTestDb();
  cleanups.push(t.cleanup);
  if (t.url === "file::memory:") return sqliteSource();
  writeFileSync(
    join(dir, ".env"),
    `DATABASE_URL=${t.url}\nAUTH_SECRET=${"s".repeat(43)}\nSTORAGE_PATH=${join(dir, "storage")}\n`,
  );
  return { db: t.db, dialect: t.dialect, url: t.url, dir };
};

/** An empty database of this run's kind (a SQLite file when the run is SQLite). */
const emptyTarget = async (): Promise<{ url: string; open: () => Db }> => {
  if (!onServer) {
    const url = `file:${join(tempDir(), "target.db")}`;
    return { url, open: () => createDb(url).db };
  }
  const t = await createTestDb({ migrate: false });
  cleanups.push(t.cleanup);
  return { url: t.url, open: () => createDb(t.url).db };
};

const backup = async (source: Source, options: { passphrase?: Buffer; settings?: boolean } = {}) =>
  (
    await runBackup({
      appDir: source.dir,
      env: {},
      callerCwd: source.dir,
      out: mkdtempSync(join(source.dir, "out-")),
      settings: options.settings ?? true,
      log: quiet,
      now: () => NOW,
      ...(options.passphrase ? { passphrase: options.passphrase } : {}),
    })
  ).path;

/** A folder for the restoring instance: its settings file (if any) and default storage. */
const restoreRun = (archive: string, overrides: Partial<Parameters<typeof runRestore>[0]> = {}) => {
  const appDir = (overrides.appDir as string | undefined) ?? tempDir();
  const lines: string[] = [];
  return {
    appDir,
    lines,
    run: () =>
      runRestore({
        appDir,
        env: {},
        callerCwd: appDir,
        archive,
        withSettings: false,
        yes: true,
        passphrase: () => Promise.reject(new Error("not asked")),
        log: { info: (m) => lines.push(m), warn: (m) => lines.push(`! ${m}`) },
        ...overrides,
      }),
  };
};

/** Every table's rows, values made comparable across kinds (booleans as 0/1, dates as ISO). */
const contents = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const table of await readSchema(db, dialect)) {
    const order = sql.join(table.primaryKey.map((c) => sql.ref(c)));
    const { rows } = await sql<Record<string, unknown>>`
      select * from ${sql.table(table.name)} order by ${order}`.execute(db);
    out[table.name] = rows
      .map((row) =>
        Object.fromEntries(
          Object.entries(row)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, v]) => [
              k,
              v instanceof Date
                ? v.toISOString()
                : typeof v === "boolean"
                  ? Number(v)
                  : typeof v === "bigint"
                    ? Number(v)
                    : v,
            ]),
        ),
      )
      // The restore's own event is the target's only extra row; the backup's own event comes
      // after its snapshot, so it's the source's only extra one.
      .filter((row) => row.action !== "instance.restored" && row.action !== "instance.backup_made");
  }
  return out;
};

const applied = async (db: Kysely<unknown>) =>
  (
    await sql<{
      name: string;
    }>`select name from ${sql.table(MIGRATION_TABLE)} order by name`.execute(db)
  ).rows.map((r) => r.name);

describe("rmk-server restore (099)", () => {
  it("restores a SQLite archive into an empty database of this kind, with every row and file", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    const archive = await backup(source);
    const target = await emptyTarget();
    const { appDir, lines, run } = restoreRun(archive, { databaseUrl: target.url });
    const result = await run();
    expect(result.newer).toEqual([]);

    const db = target.open();
    cleanups.push(() => db.destroy());
    const kind = parseDatabaseUrl(target.url).dialect;
    const into = await contents(db as unknown as Kysely<unknown>, kind);
    const from = await contents(source.db as unknown as Kysely<unknown>, "sqlite");
    expect(into).toEqual(from);
    expect(await applied(db as unknown as Kysely<unknown>)).toEqual(KNOWN);
    // The storage, written and checked, mode 0600.
    const stored = join(appDir, "data", "storage", "incident", "notes", "1.0.0.tgz");
    expect(readFileSync(stored)).toEqual(Buffer.from(ARTIFACT));
    if (process.platform !== "win32")
      expect((await import("node:fs")).statSync(stored).mode & 0o777).toBe(0o600);
    // Audited, on top of the restored log.
    const events = await db
      .selectFrom("audit_log")
      .select(["action", "metadata"])
      .where("action", "=", "instance.restored")
      .execute();
    expect(events).toHaveLength(1);
    expect(JSON.parse(String(events[0]?.metadata))).toMatchObject({
      via: "cli",
      from: { version: expect.any(String), dialect: "sqlite", time: NOW.toISOString() },
      rows: expect.any(Number),
      files: 1,
    });
    // No settings file here: a new one, with a new secret, pointing at the target.
    const written = parseEnv(readFileSync(join(appDir, ".env"), "utf8"));
    expect(written.DATABASE_URL).toBe(target.url);
    expect(written.AUTH_SECRET?.length).toBeGreaterThanOrEqual(43);
    expect(written.AUTH_SECRET).not.toBe("s".repeat(43));
    expect(written.PUBLIC_URL).toBe("https://ronne.example.com");
    expect(lines.join("\n")).toContain("new AUTH_SECRET");
    expect(lines.join("\n")).not.toContain(target.url);
  });

  it("restores this kind's archive into a new SQLite file", async () => {
    const source = await testSource();
    await seed(source.db, source.dialect, source.dir);
    const archive = await backup(source);
    const appDir = tempDir();
    // No database URL and no settings: a new SQLite file in the data folder.
    const { run } = restoreRun(archive, { appDir });
    await run();
    const db = createDb(`file:${join(appDir, "data", "ronne.db")}`).db;
    cleanups.push(() => db.destroy());
    expect(await contents(db as unknown as Kysely<unknown>, "sqlite")).toEqual(
      await contents(source.db as unknown as Kysely<unknown>, source.dialect),
    );
  });

  it("restores an archive from an older migration set, then runs the newer migrations", async () => {
    const older = KNOWN.slice(0, 18);
    const source = await sqliteSource(older);
    // Only what those migrations have: a user, by hand.
    await sql`insert into "user" (id, name, email, email_verified, role, created_at, updated_at)
      values ('u1', 'Old Root', 'old@example.com', 1, 'root', ${NOW.toISOString()}, ${NOW.toISOString()})`.execute(
      source.db,
    );
    const archive = await backup(source);
    const target = await emptyTarget();
    const { run, lines } = restoreRun(archive, { databaseUrl: target.url });
    const result = await run();
    expect(result.newer).toEqual(KNOWN.slice(18));
    const db = target.open();
    cleanups.push(() => db.destroy());
    expect(await applied(db as unknown as Kysely<unknown>)).toEqual(KNOWN);
    expect((await db.selectFrom("user").select("email").execute()).map((u) => u.email)).toEqual([
      "old@example.com",
    ]);
    expect(lines.join("\n")).toContain(`Applied ${KNOWN.length - 18} newer migrations`);
  });

  it("restores an encrypted archive with its passphrase", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    const secret = passphraseBytes("restore passphrase");
    const archive = await backup(source, { passphrase: secret });
    const target = await emptyTarget();
    let asked = 0;
    await restoreRun(archive, {
      databaseUrl: target.url,
      passphrase: async () => {
        asked++;
        return secret;
      },
    }).run();
    // Asked once, for both reads.
    expect(asked).toBe(1);
    const db = target.open();
    cleanups.push(() => db.destroy());
    expect(await db.selectFrom("user").select("email").executeTakeFirst()).toEqual({
      email: "root@example.com",
    });
  });

  it("refuses a non-empty database, non-empty storage, a newer backup and an altered archive, changing nothing", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    const archive = await backup(source);

    // A database with data: refused, and left as it was.
    const full = await testSource();
    const before = await contents(full.db as unknown as Kysely<unknown>, full.dialect);
    const refusal = await restoreRun(archive, { databaseUrl: full.url })
      .run()
      .catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(RestoreFailedError);
    expect((refusal as Error).message).toMatch(/isn't empty.*Nothing was changed/s);
    expect(await contents(full.db as unknown as Kysely<unknown>, full.dialect)).toEqual(before);

    const target = await emptyTarget();
    const isStillEmpty = async () => {
      const db = target.open();
      try {
        return await isEmptyDatabase(
          db as unknown as Kysely<unknown>,
          onServer ? full.dialect : "sqlite",
        );
      } finally {
        await db.destroy();
      }
    };

    // Storage with a file in it.
    const busy = tempDir();
    mkdirSync(join(busy, "data", "storage"), { recursive: true });
    writeFileSync(join(busy, "data", "storage", "someone-elses.tgz"), "x");
    await expect(
      restoreRun(archive, { appDir: busy, databaseUrl: target.url }).run(),
    ).rejects.toThrow(/storage folder .* isn't empty.*Nothing was changed/s);
    expect(readdirSync(join(busy, "data", "storage"))).toEqual(["someone-elses.tgz"]);
    expect(await isStillEmpty()).toBe(true);

    // A newer backup, and an altered one.
    const entries: { path: string; bytes: Uint8Array }[] = [];
    readTar(new Uint8Array(readFileSync(archive)), (e) =>
      entries.push({ path: e.path, bytes: e.bytes }),
    );
    const rewrite = async (change: (list: typeof entries) => typeof entries) => {
      const chunks: Uint8Array[] = [];
      const tar = createTarWriter((c) => {
        chunks.push(c.slice());
      });
      for (const e of change(entries.map((e) => ({ ...e })))) await tar.addFile(e.path, e.bytes);
      await tar.end();
      const path = join(tempDir(), "changed.tar");
      writeFileSync(path, Buffer.concat(chunks));
      return path;
    };
    const newer = await rewrite((list) => {
      const info = JSON.parse(new TextDecoder().decode(list[0]?.bytes));
      list[0] = {
        path: "backup.json",
        bytes: new TextEncoder().encode(
          JSON.stringify({ ...info, ronne: "9.0.0", migrations: [...KNOWN, "9999_future"] }),
        ),
      };
      return list;
    });
    const altered = await rewrite((list) =>
      list.map((e) =>
        e.path.startsWith("database/user/")
          ? {
              ...e,
              bytes: new TextEncoder().encode(
                new TextDecoder().decode(e.bytes).replace("Root", "Toor"),
              ),
            }
          : e,
      ),
    );
    for (const [path, message] of [
      [newer, /comes from a newer Ronne \(9\.0\.0\).*Nothing was changed/s],
      [altered, /doesn't match its checksum.*Nothing was changed/s],
    ] as const) {
      const appDir = tempDir();
      await expect(restoreRun(path, { appDir, databaseUrl: target.url }).run()).rejects.toThrow(
        message,
      );
      expect(await isStillEmpty()).toBe(true);
      expect(existsSync(join(appDir, "data"))).toBe(false);
      expect(existsSync(join(appDir, ".env"))).toBe(false);
    }
  });

  it("asks before restoring versions with no artifact, and refuses without a terminal or --yes", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    rmSync(join(source.dir, "storage", "incident", "notes", "1.0.0.tgz"));
    const archive = await backup(source);
    const target = await emptyTarget();
    await expect(
      restoreRun(archive, { databaseUrl: target.url, yes: false }).run(),
    ).rejects.toThrow(/2 released versions have no artifact.*--yes.*Nothing was changed/s);
    await expect(
      restoreRun(archive, {
        databaseUrl: target.url,
        yes: false,
        confirm: async () => false,
      }).run(),
    ).rejects.toThrow(/Cancelled\. Nothing was changed/);
    const asked: string[] = [];
    await restoreRun(archive, {
      databaseUrl: target.url,
      yes: false,
      confirm: async (message) => {
        asked.push(message);
        return true;
      },
    }).run();
    expect(asked[0]).toMatch(/Restore anyway\?/);
  });

  it("writes the backup's settings with --with-settings, and otherwise keeps a settings file and says what differs", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    const archive = await backup(source);

    // No settings yet, --with-settings: the backup's, with this database and storage.
    const target = await emptyTarget();
    const fresh = restoreRun(archive, { databaseUrl: target.url, withSettings: true });
    await fresh.run();
    const written = parseEnv(readFileSync(join(fresh.appDir, ".env"), "utf8"));
    expect(written).toMatchObject({
      DATABASE_URL: target.url,
      AUTH_SECRET: "s".repeat(43),
      STORAGE_PATH: "./data/storage",
      PUBLIC_URL: "https://ronne.example.com",
    });

    // A settings file that's there stays; what differs is said.
    const kept = tempDir();
    const second = await emptyTarget();
    writeFileSync(
      join(kept, ".env"),
      `DATABASE_URL=${second.url}\nAUTH_SECRET=${"k".repeat(43)}\nPUBLIC_URL=http://localhost:7650\n`,
    );
    const before = readFileSync(join(kept, ".env"), "utf8");
    const run = restoreRun(archive, { appDir: kept, withSettings: true });
    await run.run();
    expect(readFileSync(join(kept, ".env"), "utf8")).toBe(before);
    expect(run.lines.join("\n")).toContain(
      "AUTH_SECRET differs from the backup's: everyone will need to sign in again",
    );
    expect(run.lines.join("\n")).toContain(
      "PUBLIC_URL differs from the backup's (https://ronne.example.com)",
    );
    expect(run.lines.join("\n")).not.toContain("k".repeat(43));
    expect(run.lines.join("\n")).not.toContain("s".repeat(43));

    // --with-settings on a backup made without them.
    const bare = await backup(source, { settings: false });
    await expect(
      restoreRun(bare, { databaseUrl: (await emptyTarget()).url, withSettings: true }).run(),
    ).rejects.toThrow(/no settings file.*Nothing was changed/s);
  });

  it("stops when the archive loses an entry between the verify and the restore reads", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    const archive = await backup(source);
    const entries: { path: string; bytes: Uint8Array }[] = [];
    readTar(new Uint8Array(readFileSync(archive)), (e) =>
      entries.push({ path: e.path, bytes: e.bytes }),
    );
    const without = async (drop: (path: string) => boolean, backupLast = false) => {
      const chunks: Uint8Array[] = [];
      const tar = createTarWriter((c) => {
        chunks.push(c.slice());
      });
      const list = backupLast ? [...entries.slice(1), entries[0] as (typeof entries)[0]] : entries;
      for (const e of list) if (!drop(e.path)) await tar.addFile(e.path, e.bytes);
      await tar.end();
      return Buffer.concat(chunks);
    };
    for (const [what, drop, message, backupLast] of [
      [
        // audit_log: nothing refers to it, so only the completeness check can notice.
        "a database part",
        (p: string) => p.startsWith("database/audit_log/"),
        // Caught by the part order (the next part isn't where it was) or, if it was the last,
        // by the count: either way, before the rows commit.
        /audit_log\/000001\.jsonl went missing|changed since the archive was verified/,
      ],
      [
        "a stored file",
        (p: string) => p.startsWith("storage/"),
        /storage\/incident\/notes\/1\.0\.0\.tgz went missing/,
      ],
      ["the manifest", (p: string) => p === "manifest.json", /manifest\.json went missing/],
      // Without backup.json the archive no longer starts as the format says: refused at once.
      ["backup.json", (p: string) => p === "backup.json", /changed since the archive was verified/],
      // In another order (backup.json last): refused too.
      ["the order", (p: string) => p === "never", /changed since the archive was verified/, true],
    ] as const) {
      const copy = join(tempDir(), "copy.tar");
      writeFileSync(copy, readFileSync(archive));
      const changed = await without(drop, backupLast === true);
      const target = await emptyTarget();
      // The question about the missing artifact (1.1.0) comes between the two reads.
      const run = restoreRun(copy, {
        databaseUrl: target.url,
        yes: false,
        confirm: async () => {
          writeFileSync(copy, changed);
          return true;
        },
      });
      await expect(run.run(), what).rejects.toThrow(message);
    }
  });

  it("refuses an impossible timestamp rather than moving it to another day, in every kind", () => {
    const pg = { name: "created_at", type: "timestamptz", nullable: false };
    const lite = { name: "created_at", type: "text", nullable: false };
    for (const bad of [
      "2026-02-30T00:00:00.000Z",
      "2026-10-12T24:00:00.000Z",
      "2026-13-01T00:00:00Z",
      "2026-10-12 15:31:02Z",
      "2026-10-12T15:31:02+00:00",
      "not a date",
      "0000-01-01T00:00:00.000Z",
    ]) {
      expect(() => convertValue(bad, pg, "postgres", "here"), bad).toThrow(
        /not an ISO 8601 UTC timestamp/,
      );
      // SQLite's timestamps are text columns, known by their `_at` names.
      expect(() => convertValue(bad, lite, "sqlite", "here"), bad).toThrow(
        /not an ISO 8601 UTC timestamp/,
      );
    }
    // Other text columns take any text.
    expect(
      convertValue(
        "not a date",
        { name: "description", type: "text", nullable: false },
        "sqlite",
        "here",
      ),
    ).toBe("not a date");
    // Written as text, never a Date the driver would put in the process's time zone.
    expect(convertValue("1850-01-01T00:00:00Z", pg, "postgres", "here")).toBe(
      "1850-01-01T00:00:00.000Z",
    );
    expect(convertValue("2026-10-12T15:31:02.1Z", pg, "mysql", "here")).toBe(
      "2026-10-12 15:31:02.100",
    );
    expect(convertValue("2026-10-12T15:31:02.123Z", lite, "sqlite", "here")).toBe(
      "2026-10-12T15:31:02.123Z",
    );
  });

  it.skipIf(!onServer)(
    "keeps the naming restore relies on: timestamp columns, and only they, end in _at",
    async () => {
      const t = await createTestDb();
      cleanups.push(t.cleanup);
      for (const table of await readSchema(t.db as unknown as Kysely<unknown>, t.dialect))
        for (const column of table.columns) {
          const timestamp = /^(timestamp|datetime)/.test(column.type);
          expect(column.name.endsWith("_at"), `${table.name}.${column.name} (${column.type})`).toBe(
            timestamp,
          );
        }
    },
  );

  it("leaves a non-empty SQLite file untouched, and refuses one another process holds", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    const archive = await backup(source);
    // A rollback-journal file with a table: opening it as createDb does would turn WAL on.
    const dir = tempDir();
    const file = join(dir, "other.db");
    writeJournalModeSqlite(file, "create table keep (x)");
    const before = readFileSync(file);
    await expect(restoreRun(archive, { databaseUrl: `file:${file}` }).run()).rejects.toThrow(
      /SQLite database isn't empty.*Nothing was changed/s,
    );
    expect(readFileSync(file).equals(before)).toBe(true);
    // Its own lock: from the emptiness check on, no other connection can write.
    const mine = join(dir, "mine.db");
    let seen: string | null = "not tried";
    await restoreRun(archive, {
      databaseUrl: `file:${mine}`,
      onLocked: async () => {
        seen = tryWriteSqlite(mine);
      },
    }).run();
    expect(seen).toBe("SQLITE_BUSY");
    expect(tryWriteSqlite(mine)).toBeNull();

    // An empty file another process has locked: refused as in use, nothing written.
    const empty = join(dir, "empty.db");
    const release = holdSqliteExclusively(empty);
    try {
      const appDir = tempDir();
      await expect(
        restoreRun(archive, { appDir, databaseUrl: `file:${empty}` }).run(),
      ).rejects.toThrow(/in use by another process.*Nothing was changed/s);
      expect(existsSync(join(appDir, ".env"))).toBe(false);
    } finally {
      release();
    }
  });

  it("warns when a kept settings file names another database, and keeps a settings file that appeared meanwhile", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    const archive = await backup(source);
    const appDir = tempDir();
    writeFileSync(
      join(appDir, ".env"),
      `DATABASE_URL=file:${join(appDir, "old.db")}\nAUTH_SECRET=${"s".repeat(43)}\n`,
    );
    const target = await emptyTarget();
    const elsewhere = restoreRun(archive, { appDir, databaseUrl: target.url, withSettings: true });
    await elsewhere.run();
    const text = elsewhere.lines.join("\n");
    expect(text).toContain("The settings name another database than the one restored into");
    expect(text).toContain("--with-settings: a settings file is here already, so it was kept.");

    const later = tempDir();
    const appeared = `DATABASE_URL=file:${join(later, "mine.db")}\nAUTH_SECRET=${"m".repeat(43)}\n`;
    const second = await emptyTarget();
    const run = restoreRun(archive, {
      appDir: later,
      databaseUrl: second.url,
      yes: false,
      confirm: async () => {
        writeFileSync(join(later, ".env"), appeared);
        return true;
      },
    });
    await run.run();
    expect(readFileSync(join(later, ".env"), "utf8")).toBe(appeared);
    expect(run.lines.join("\n")).toContain(
      "A settings file appeared while the restore ran, so it was kept",
    );

    // A kept settings file rewritten during the restore: judged as it is at the end.
    const rewritten = tempDir();
    const third = await emptyTarget();
    writeFileSync(
      join(rewritten, ".env"),
      `DATABASE_URL=${third.url}\nAUTH_SECRET=${"s".repeat(43)}\n`,
    );
    const changed = restoreRun(archive, {
      appDir: rewritten,
      yes: false,
      confirm: async () => {
        writeFileSync(
          join(rewritten, ".env"),
          `DATABASE_URL=file:${join(rewritten, "other.db")}\n`,
        );
        return true;
      },
    });
    await changed.run();
    expect(changed.lines.join("\n")).toContain(
      "The settings name another database than the one restored into",
    );

    // Removed during the restore: said, not "kept".
    const removed = tempDir();
    const fourth = await emptyTarget();
    writeFileSync(
      join(removed, ".env"),
      `DATABASE_URL=${fourth.url}\nAUTH_SECRET=${"s".repeat(43)}\n`,
    );
    const gone = restoreRun(archive, {
      appDir: removed,
      yes: false,
      confirm: async () => {
        rmSync(join(removed, ".env"));
        return true;
      },
    });
    await gone.run();
    expect(gone.lines.join("\n")).toContain("The settings file was removed while the restore ran");
    expect(existsSync(join(removed, ".env"))).toBe(false);
  });

  it("stops when parts are moved, renamed or added between the reads", async () => {
    const source = await sqliteSource();
    await seed(source.db, "sqlite", source.dir);
    const archive = await backup(source);
    const entries: { path: string; bytes: Uint8Array }[] = [];
    readTar(new Uint8Array(readFileSync(archive)), (e) =>
      entries.push({ path: e.path, bytes: e.bytes }),
    );
    const parts = entries.filter((e) => e.path.startsWith("database/"));
    const rest = (prefix: string) => entries.filter((e) => e.path.startsWith(prefix));
    const tarOf = async (list: typeof entries) => {
      const chunks: Uint8Array[] = [];
      const tar = createTarWriter((c) => {
        chunks.push(c.slice());
      });
      for (const e of list) await tar.addFile(e.path, e.bytes);
      await tar.end();
      return Buffer.concat(chunks);
    };
    const head = entries[0] as (typeof entries)[0];
    const tail = entries.filter((e) => !e.path.startsWith("database/") && e.path !== "backup.json");
    const variants: Record<string, typeof entries> = {
      // Two tables' parts swapped: each still whole and checked, but not where they were.
      "parts in another order": [
        head,
        parts[1] as (typeof parts)[0],
        parts[0] as (typeof parts)[0],
        ...parts.slice(2),
        ...tail,
      ],
      // A part of a table the schema doesn't have.
      "a table the schema lacks": [
        head,
        ...parts,
        { path: "database/zzz/000001.jsonl", bytes: new TextEncoder().encode("{}\n") },
        ...tail,
      ],
    };
    void rest;
    for (const [what, list] of Object.entries(variants)) {
      const copy = join(tempDir(), "copy.tar");
      writeFileSync(copy, readFileSync(archive));
      const changed = await tarOf(list);
      const target = await emptyTarget();
      await expect(
        restoreRun(copy, {
          databaseUrl: target.url,
          yes: false,
          confirm: async () => {
            writeFileSync(copy, changed);
            return true;
          },
        }).run(),
        what,
      ).rejects.toThrow(/changed since the archive was verified/);
    }
  });
});
