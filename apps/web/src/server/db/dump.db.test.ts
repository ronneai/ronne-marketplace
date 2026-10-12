import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTarWriter, readTar } from "@ronneai/core/pack";
import { type Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot } from "../domains/identity/actions/root-account";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { UNFILTERED } from "../domains/workspaces/models/viewer";
import { createDb, type Db } from "./create-db";
import { toDbDate } from "./dates";
import { type DumpedTable, dumpDatabase, dumpTables, readRowsInKeyOrder } from "./dump";
import { readSchema } from "./introspect";
import { migrateToLatest } from "./migrate";
import { GLOBAL_WORKSPACE_ID } from "./migrations/0019_workspaces";
import { readSnapshot } from "./snapshot";
import { createTestDb, type TestDb } from "./testing/test-db";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const opened = async (): Promise<TestDb> => {
  const t = await createTestDb();
  cleanups.push(t.cleanup);
  return t;
};

const NOW = new Date("2026-10-12T15:31:02.123Z");

/** A small instance: root, a scope, an item with two versions and tags, a member. */
const seed = async (t: TestDb) => {
  const { id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  await t.db
    .insertInto("scopes")
    .values({
      id: "scope-1",
      name: "incident",
      description: "Items for the backup test.",
      created_by: rootId,
      created_at: toDbDate(NOW, t.dialect),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
  const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
  await items.transaction(async (repo) => {
    const itemId = await repo.insertItem({
      scopeId: "scope-1",
      name: "notes",
      type: "skill",
      description: "Release notes that say why.",
      ownerId: rootId,
      createdAt: NOW,
    });
    for (const version of ["1.0.0", "1.1.0"]) {
      const versionId = await repo.insertVersion({
        itemId,
        version,
        manifest: { name: "@incident/notes", type: "skill", description: "Notes.", version },
        readme: null,
        files: [{ path: "SKILL.md", size: 10, executable: false }],
        notes: null,
        artifactPath: `incident/notes/${version}.tgz`,
        sha256: "a".repeat(64),
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
  return { rootId };
};

type Archive = { entries: { path: string; text: string }[] };

/** Dumps into a tar in memory, through the streaming writer, and reads it back. */
const dumpToTar = async (db: Db, dialect: TestDb["dialect"], options = {}) => {
  const chunks: Uint8Array[] = [];
  const tar = createTarWriter((chunk) => {
    chunks.push(chunk.slice());
  });
  const { tables } = await dumpDatabase(
    db as unknown as Kysely<unknown>,
    dialect,
    (path, bytes) => tar.addFile(path, bytes),
    options,
  );
  await tar.end();
  const bytes = Buffer.concat(chunks);
  const archive: Archive = { entries: [] };
  readTar(bytes, (entry) =>
    archive.entries.push({ path: entry.path, text: new TextDecoder().decode(entry.bytes) }),
  );
  return { tables, archive };
};

const rowsOf = (archive: Archive, table: string) =>
  archive.entries
    .filter((e) => e.path.startsWith(`database/${table}/`))
    .flatMap((e) => e.text.split("\n").filter(Boolean))
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("dumping the database (099)", () => {
  it("dumps every table's rows, as the format encodes them, counted and in key order", async () => {
    const t = await opened();
    await seed(t);
    const { tables, archive } = await dumpToTar(t.db, t.dialect);

    const schema = await readSchema(t.db as unknown as Kysely<unknown>, t.dialect);
    expect(Object.keys(tables).sort()).toEqual(schema.map((s) => s.name).sort());
    expect(Object.keys(tables)).not.toContain("ronne_migration");
    expect(Object.keys(tables)).not.toContain("ronne_migration_lock");
    expect(schema.every((s) => s.primaryKey.length > 0)).toBe(true);

    for (const [name, dumped] of Object.entries(tables)) {
      const { rows } = await sql<{ n: number | string }>`
        select count(*) as n from ${sql.table(name)}`.execute(t.db);
      expect(dumped.rows, name).toBe(Number(rows[0]?.n));
      expect(rowsOf(archive, name)).toHaveLength(dumped.rows);
      expect(dumped.parts, name).toBe(dumped.rows === 0 ? 0 : 1);
    }

    // Values: dates as ISO 8601 UTC, integers as numbers, booleans as the dialect stores them.
    const [root] = rowsOf(archive, "user");
    expect(root?.email).toBe("root@example.com");
    expect(root?.created_at).toMatch(ISO);
    // As the dialect stores it: PostgreSQL's boolean, SQLite's and MySQL's 0 or 1.
    expect(typeof root?.email_verified).toBe(t.dialect === "postgres" ? "boolean" : "number");
    expect(Object.keys(root ?? {})).toEqual(tables.user?.columns);
    const versions = rowsOf(archive, "item_versions");
    expect(versions.map((v) => v.version).sort()).toEqual(["1.0.0", "1.1.0"]);
    expect(versions[0]?.size).toBe(1024);
    expect(versions[0]?.published_at).toBe(NOW.toISOString());

    // Rows in primary-key order, and the global workspace the migrations made is there.
    const ids = versions.map((v) => String(v.id));
    expect(ids).toEqual([...ids].sort());
    expect(rowsOf(archive, "workspaces").map((w) => w.id)).toContain(GLOBAL_WORKSPACE_ID);

    // One table's parts together, tables in foreign-key order: user before items before versions.
    const order = archive.entries.map((e) => e.path.split("/")[1]);
    expect(order.indexOf("user")).toBeLessThan(order.indexOf("items"));
    expect(order.indexOf("items")).toBeLessThan(order.indexOf("item_versions"));
  });

  it("reads composite keys in batches of one with nothing skipped or repeated", async () => {
    const t = await opened();
    await seed(t);
    const schema = await readSchema(t.db as unknown as Kysely<unknown>, t.dialect);
    const distTags = schema.find((s) => s.name === "dist_tags");
    expect(distTags?.primaryKey).toEqual(["item_id", "tag"]);
    const seen: string[] = [];
    await readRowsInKeyOrder(
      t.db as unknown as Kysely<unknown>,
      t.dialect,
      distTags as NonNullable<typeof distTags>,
      async (rows) => {
        expect(rows).toHaveLength(1);
        seen.push(String(rows[0]?.tag));
      },
      { batchRows: 1 },
    );
    expect(seen).toEqual(["latest", "stable"]);
  });

  /** Settings rows with values of the given lengths, keyed a, b, c… in order. */
  const settings = async (t: TestDb, rootId: string, lengths: number[]) => {
    for (const [i, length] of lengths.entries())
      await t.db
        .insertInto("instance_settings")
        .values({
          key: String.fromCharCode(97 + i),
          value: "v".repeat(length),
          updated_by: rootId,
          updated_at: toDbDate(NOW, t.dialect),
        })
        .execute();
  };

  const settingsTable = async (t: TestDb) =>
    (await readSchema(t.db as unknown as Kysely<unknown>, t.dialect)).filter(
      (s) => s.name === "instance_settings",
    );

  it("cuts a table into parts by rows or bytes, numbered from 1, a large row on its own", async () => {
    const t = await opened();
    const { rootId } = await seed(t);
    await settings(t, rootId, [20, 20, 600, 20, 20]);
    const db = t.db as unknown as Kysely<unknown>;
    const schema = await settingsTable(t);

    const byRows: string[] = [];
    const dumped = await dumpTables(db, t.dialect, schema, async (path) => void byRows.push(path), {
      partMaxRows: 2,
    });
    expect(byRows).toEqual([
      "database/instance_settings/000001.jsonl",
      "database/instance_settings/000002.jsonl",
      "database/instance_settings/000003.jsonl",
    ]);
    expect(dumped.instance_settings).toMatchObject<Partial<DumpedTable>>({ rows: 5, parts: 3 });

    // 300 bytes a part: a and b together, then c (600 bytes) alone, then d and e.
    const bySize: string[][] = [];
    await dumpTables(
      db,
      t.dialect,
      schema,
      async (_path, bytes) =>
        void bySize.push(
          new TextDecoder()
            .decode(bytes)
            .split("\n")
            .filter(Boolean)
            .map((line) => String(JSON.parse(line).key)),
        ),
      { partMaxBytes: 300 },
    );
    expect(bySize).toEqual([["a", "b"], ["c"], ["d", "e"]]);
  });

  it("sizes a batch by its rows' bytes, a wide row coming alone, with nothing skipped", async () => {
    const t = await opened();
    const { rootId } = await seed(t);
    await settings(t, rootId, [20, 20, 2000, 20, 20]);
    const [table] = await settingsTable(t);
    const batches: string[][] = [];
    await readRowsInKeyOrder(
      t.db as unknown as Kysely<unknown>,
      t.dialect,
      table as NonNullable<typeof table>,
      async (rows) => void batches.push(rows.map((r) => String(r.key))),
      { batchBytes: 500 },
    );
    expect(batches.flat()).toEqual(["a", "b", "c", "d", "e"]);
    expect(batches).toContainEqual(["c"]);
    expect(batches.length).toBeGreaterThanOrEqual(3);
  });

  it("stops on a NULL in a primary key rather than skip the rows after it (SQLite allows one)", async () => {
    const t = await opened();
    if (t.dialect !== "sqlite") return; // The servers refuse NULL in a primary key themselves.
    const { rootId } = await seed(t);
    await settings(t, rootId, [10]);
    await sql`insert into instance_settings (key, value, updated_by, updated_at)
      values (null, 'x', ${rootId}, ${NOW.toISOString()})`.execute(t.db);
    const [table] = await settingsTable(t);
    expect(table?.columns.find((c) => c.name === "key")?.nullable).toBe(true);
    await expect(dumpToTar(t.db, t.dialect)).rejects.toThrow(
      "A row of instance_settings has no value in its primary key (key)",
    );
  });

  /** A reader and a writer on the same database at once: SQLite needs a file for that. */
  const twoConnections = async (t: TestDb) => {
    if (t.dialect !== "sqlite") {
      const writer = createDb(t.url).db;
      cleanups.push(() => writer.destroy());
      return { reader: t.db, writer };
    }
    const dir = mkdtempSync(join(tmpdir(), "ronne-dump-"));
    const url = `file:${join(dir, "snapshot.db")}`;
    const reader = createDb(url).db;
    const writer = createDb(url).db;
    await migrateToLatest(reader, "sqlite");
    cleanups.push(async () => {
      await reader.destroy();
      await writer.destroy();
      rmSync(dir, { recursive: true, force: true });
    });
    return { reader, writer };
  };

  const lateUser = (writer: Db, dialect: TestDb["dialect"]) =>
    writer
      .insertInto("user")
      .values({
        id: "written-during-the-dump",
        name: "Late",
        email: "late@example.com",
        email_verified: dialect === "sqlite" ? 0 : false,
        image: null,
        created_at: toDbDate(new Date(), dialect),
        updated_at: toDbDate(new Date(), dialect),
        role: "user",
        disabled_at: null,
      } as never)
      .execute();

  it("leaves out a write made while the dump runs", async () => {
    const t = await opened();
    const { reader, writer } = await twoConnections(t);
    await seed({ ...t, db: reader });

    const written: string[] = [];
    const { archive } = await dumpToTar(reader, t.dialect, {
      // Before the first table (user): the snapshot has started, and the dump hasn't read users.
      beforeTable: async (table: string) => {
        if (written.length > 0) return;
        written.push(table);
        await lateUser(writer, t.dialect);
      },
    });
    expect(written).toEqual(["user"]);
    expect(rowsOf(archive, "user").map((u) => u.email)).toEqual(["root@example.com"]);
    // The write itself went through, and a dump after it has it.
    const later = await dumpToTar(reader, t.dialect);
    expect(
      rowsOf(later.archive, "user")
        .map((u) => u.email)
        .sort(),
    ).toEqual(["late@example.com", "root@example.com"]);
  });

  it("takes the snapshot before its work's first read", async () => {
    const t = await opened();
    const { reader, writer } = await twoConnections(t);
    await seed({ ...t, db: reader });
    // The write lands after the snapshot began and before anything inside it read a table.
    const emails = await readSnapshot(reader, t.dialect, async (snapshot) => {
      await lateUser(writer, t.dialect);
      const { rows } = await sql<{ email: string }>`select email from ${sql.table("user")}`.execute(
        snapshot,
      );
      return rows.map((r) => r.email);
    });
    expect(emails).toEqual(["root@example.com"]);
  });

  it("refuses a write inside the snapshot on every database, and gives the connection back", async () => {
    const t = await opened();
    await expect(
      readSnapshot(t.db, t.dialect, (snapshot) => lateUser(snapshot as Db, t.dialect)),
    ).rejects.toThrow();
    await lateUser(t.db, t.dialect);
    const { rows } = await sql<{ n: number | string }>`
      select count(*) as n from ${sql.table("user")}`.execute(t.db);
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it("puts SQLite's query_only back as it was", async () => {
    const t = await opened();
    if (t.dialect !== "sqlite") return; // A SQLite setting.
    const queryOnly = async () =>
      Number(
        (await sql<{ query_only: number }>`pragma query_only`.execute(t.db)).rows[0]?.query_only,
      );
    await readSnapshot(t.db, t.dialect, async () => undefined);
    expect(await queryOnly()).toBe(0);
    await sql`pragma query_only = on`.execute(t.db);
    await readSnapshot(t.db, t.dialect, async () => undefined);
    await expect(
      readSnapshot(t.db, t.dialect, async () => Promise.reject(new Error("x"))),
    ).rejects.toThrow("x");
    expect(await queryOnly()).toBe(1);
    // Even when the work turned it off itself.
    await readSnapshot(t.db, t.dialect, async (s) => {
      await sql`pragma query_only = off`.execute(s);
    });
    expect(await queryOnly()).toBe(1);
    await sql`pragma query_only = off`.execute(t.db);
  });

  it("rolls the snapshot back and passes on the error when the work fails", async () => {
    const t = await opened();
    await expect(
      readSnapshot(t.db, t.dialect, async () => {
        throw new Error("disk full");
      }),
    ).rejects.toThrow("disk full");
    // The connection is usable again: no transaction was left open on it.
    await expect(
      readSnapshot(t.db, t.dialect, async (s) => (await sql`select 1 as one`.execute(s)).rows),
    ).resolves.toHaveLength(1);
  });
});
