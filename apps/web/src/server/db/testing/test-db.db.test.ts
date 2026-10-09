import { sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_WORKSPACE_ID } from "../../domains/workspaces/models/workspace";
import { createDb, type Db } from "../create-db";
import { toDbDate } from "../dates";
import { getAppDb } from "../instance";
import { MIGRATION_TABLE } from "../migrate";
import { createTestDb, dropStaleTestDbs, type TestDb } from "./test-db";

/** The test databases on the server of `admin`. */
const serverDbNames = async (admin: Db) =>
  (
    await sql<{
      name: string;
    }>`select datname as name from pg_database where datname like 'ronne_test_%'`
      .execute(admin)
      .catch(() =>
        sql<{
          name: string;
        }>`select schema_name as name from information_schema.schemata where schema_name like 'ronne_test_%'`.execute(
          admin,
        ),
      )
  ).rows.map((row) => row.name);

const opened: TestDb[] = [];
afterEach(async () => {
  for (const t of opened.splice(0)) await t.cleanup();
});
const open = async (options?: { migrate?: boolean; fresh?: boolean }) => {
  const t = await createTestDb(options);
  opened.push(t);
  return t;
};
const tables = async (t: TestDb) =>
  (await t.db.introspection.getTables())
    .map((x) => x.name)
    .filter((n) => !n.startsWith(MIGRATION_TABLE));

describe("dropStaleTestDbs (112)", () => {
  it("drops test databases an interrupted run left, and leaves recent ones", async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || url.startsWith("file:")) return;
    const admin = createDb(url).db;
    // A ULID from 2020: its time says it's long gone.
    const old = "ronne_test_01e0000000000000000000000a";
    await sql`create database ${sql.id(old)}`.execute(admin);
    const recent = await open({ fresh: true });
    await dropStaleTestDbs(url);
    const names = await serverDbNames(admin);
    expect(names).not.toContain(old);
    expect(names).toContain(new URL(recent.url).pathname.slice(1));
    await admin.destroy();
  });
});

describe("createTestDb", () => {
  it("returns a migrated database by default", async () => {
    const t = await open();
    expect(await tables(t)).toEqual(
      expect.arrayContaining(["user", "session", "account", "verification", "access_tokens"]),
    );
  });

  it("returns an empty database with migrate: false", async () => {
    expect(await tables(await open({ migrate: false }))).toEqual([]);
  });

  const addUser = (t: TestDb, id: string) => {
    const now = toDbDate(new Date(), t.dialect);
    return t.db
      .insertInto("user")
      .values({
        id,
        name: "A",
        email: `${id.toLowerCase()}@example.com`,
        email_verified: 0,
        image: null,
        created_at: now,
        updated_at: now,
        disabled_at: null,
      })
      .execute();
  };

  it("gives each test a database just migrated: what the last one wrote is gone (112)", async () => {
    const first = await open();
    await addUser(first, "01TESTDB000000000000000000");
    await first.db.updateTable("workspaces").set({ name: "changed" }).execute();
    const next = await open();
    expect(await next.db.selectFrom("user").select("id").execute()).toEqual([]);
    // The rows the migrations insert themselves are back as they were: the global workspace.
    expect(await next.db.selectFrom("workspaces").select(["id", "name"]).execute()).toEqual([
      { id: GLOBAL_WORKSPACE_ID, name: "global" },
    ]);
  });

  it("starts each test on new connections, and survives a test that closed its own (112)", async () => {
    const first = await open();
    if (first.dialect === "mysql") await sql`set session foreign_key_checks = 0`.execute(first.db);
    await first.db.destroy();
    const next = await open();
    if (next.dialect === "mysql") {
      const { rows } = await sql<{
        on: number;
      }>`select @@foreign_key_checks as ${sql.id("on")}`.execute(next.db);
      expect(Number(rows[0]?.on)).toBe(1);
    }
    expect(await tables(next)).toEqual(expect.arrayContaining(["user", "workspaces"]));
  });

  it("migrates afresh after a test added an index (112)", async () => {
    const first = await open();
    await sql`create unique index probe_uniq on ${sql.id("user")} (name)`.execute(first.db);
    await first.cleanup();
    const next = await open();
    const indexes =
      next.dialect === "postgres"
        ? await sql`select 1 from pg_indexes where indexname = 'probe_uniq'`.execute(next.db)
        : next.dialect === "mysql"
          ? await sql`select 1 from information_schema.statistics where table_schema = database() and index_name = 'probe_uniq'`.execute(
              next.db,
            )
          : { rows: [] };
    expect(indexes.rows).toEqual([]);
  });

  it("gives the next test a clean database when one left a transaction open (112)", async () => {
    const first = await open();
    if (first.dialect === "sqlite") return;
    let end = () => {};
    const held = new Promise<void>((resolve) => {
      end = resolve;
    });
    const started = new Promise<void>((resolve) => {
      void first.db
        .transaction()
        .execute(async (trx) => {
          await trx.updateTable("catalogue_revision").set({ instance: "held" }).execute();
          resolve();
          await held;
        })
        .catch(() => {});
    });
    await started;
    const warn = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const next = await open();
    // MySQL and MariaDB end the connection as its pool closes (the transaction rolls back), so the
    // database is reset as usual; PostgreSQL's pool waits for it, so the next test gets a new one.
    expect(next.url === first.url).toBe(first.dialect !== "postgres");
    expect(
      await next.db.selectFrom("catalogue_revision").select("instance").execute(),
    ).not.toContainEqual({
      instance: "held",
    });
    if (first.dialect === "postgres")
      expect(String(warn.mock.calls.at(-1)?.[0])).toContain("a test left a transaction open");
    end();
    warn.mockRestore();
    // The one left behind: dropped here, now the transaction is over, rather than by the next run.
    await first.db.destroy();
    if (next.url === first.url) return;
    const name = new URL(first.url).pathname.slice(1);
    const admin = createDb(process.env.TEST_DATABASE_URL ?? "").db;
    await sql`drop database if exists ${sql.id(name)}`.execute(admin);
    await admin.destroy();
  });

  it("closes the app's cached pool on the shared database between tests (112)", async () => {
    const first = await open();
    if (first.dialect !== "mysql") return;
    await sql`set session foreign_key_checks = 0`.execute(getAppDb(first.url).db);
    await first.cleanup();
    const next = await open();
    const { rows } = await sql<{
      on: number;
    }>`select @@foreign_key_checks as ${sql.id("on")}`.execute(getAppDb(next.url).db);
    expect(Number(rows[0]?.on)).toBe(1);
  });

  it("migrates afresh after a test changed the schema (112)", async () => {
    const first = await open();
    await sql`drop table plugin_feeds`.execute(first.db);
    await sql`create table probe_extra (id varchar(26))`.execute(first.db);
    // As afterEach does between tests.
    await first.cleanup();
    const next = await open();
    expect(await tables(next)).toEqual(expect.arrayContaining(["plugin_feeds"]));
    expect(await tables(next)).not.toContain("probe_extra");
  });

  it("gives a database of its own with fresh: true, so a test can hold two", async () => {
    const a = await open();
    const b = await open({ fresh: true });
    await addUser(a, "01TESTDB000000000000000001");
    expect(await b.db.selectFrom("user").select("id").execute()).toEqual([]);
  });
});
