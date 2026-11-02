import { type Kysely, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { createTestDb, type TestDb } from "../testing/test-db";
import { auditContext } from "./0043_audit_context";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const insert = (values: Record<string, string | null> = {}) => {
  const id = newId();
  return t.db
    .insertInto("audit_log")
    .values({
      id,
      actor_id: null,
      action: "user.created",
      target_type: "user",
      target_id: null,
      metadata: "{}",
      ip_address: null,
      created_at: toDbDate(new Date(), t.dialect),
      ...values,
    })
    .execute()
    .then(() => id);
};

const row = (id: string) =>
  t.db
    .selectFrom("audit_log")
    .select(["request_id", "via", "user_agent", "workspace_id", "outcome"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();

/** The audit_log indexes' names, as each database lists them. */
const indexes = async (db: Kysely<unknown>): Promise<string[]> => {
  if (t.dialect === "sqlite") {
    const { rows } = await sql<{
      name: string;
    }>`select name from pragma_index_list('audit_log')`.execute(db);
    return rows.map((r) => r.name);
  }
  if (t.dialect === "postgres") {
    const { rows } = await sql<{
      indexname: string;
    }>`select indexname from pg_indexes where tablename = 'audit_log'`.execute(db);
    return rows.map((r) => r.indexname);
  }
  const { rows } = await sql<{
    name: string;
  }>`select distinct index_name as name from information_schema.statistics
    where table_schema = database() and table_name = 'audit_log'`.execute(db);
  return rows.map((r) => r.name);
};

/** An index's columns in order. */
const indexColumns = async (db: Kysely<unknown>, name: string): Promise<string[]> => {
  if (t.dialect === "sqlite") {
    const { rows } = await sql<{
      name: string;
    }>`select name from pragma_index_info(${name}) order by seqno`.execute(db);
    return rows.map((r) => r.name);
  }
  if (t.dialect === "postgres") {
    const { rows } = await sql<{
      indexdef: string;
    }>`select indexdef from pg_indexes where indexname = ${name}`.execute(db);
    const def = rows[0]?.indexdef ?? "";
    return (def.slice(def.indexOf("(") + 1, def.lastIndexOf(")")) || "")
      .split(",")
      .map((c) => c.trim().replace(/"/g, ""));
  }
  const { rows } = await sql<{
    name: string;
  }>`select column_name as name from information_schema.statistics
    where table_schema = database() and table_name = 'audit_log' and index_name = ${name} order by seq_in_index`.execute(
    db,
  );
  return rows.map((r) => r.name);
};

describe("0043_audit_context", () => {
  it("reads a row written without the new fields with no channel and a success", async () => {
    expect(await row(await insert())).toEqual({
      request_id: null,
      via: null,
      user_agent: null,
      workspace_id: null,
      outcome: "success",
    });
  });

  it("stores the request, the channel, the client, the workspace and the outcome", async () => {
    // 256 characters that take two bytes each: the column holds characters, not bytes.
    const client = "é".repeat(256);
    const id = await insert({
      request_id: "r".repeat(128),
      via: "system",
      user_agent: client,
      workspace_id: newId(),
      outcome: "denied",
    });
    expect(await row(id)).toMatchObject({
      request_id: "r".repeat(128),
      via: "system",
      user_agent: client,
      outcome: "denied",
    });
  });

  it("matches a request ID exactly, on every database: case counts", async () => {
    const id = await insert({ request_id: "Proxy-abc.1" });
    await insert({ request_id: "proxy-ABC.1" });
    const found = await t.db
      .selectFrom("audit_log")
      .select("id")
      .where("request_id", "=", "Proxy-abc.1")
      .execute();
    expect(found.map((r) => r.id)).toEqual([id]);
    expect(
      await t.db
        .selectFrom("audit_log")
        .select("id")
        .where("request_id", "=", "PROXY-ABC.1")
        .execute(),
    ).toEqual([]);
  });

  it("keeps a workspace id with no workspace behind it: no foreign key", async () => {
    const gone = newId();
    expect((await row(await insert({ workspace_id: gone }))).workspace_id).toBe(gone);
  });

  it("indexes a workspace's events in id order, and an event's request", async () => {
    const names = await indexes(t.db as Kysely<unknown>);
    expect(names).toEqual(
      expect.arrayContaining(["audit_log_workspace_idx", "audit_log_request_idx"]),
    );
    expect(await indexColumns(t.db as Kysely<unknown>, "audit_log_workspace_idx")).toEqual([
      "workspace_id",
      "id",
    ]);
    expect(await indexColumns(t.db as Kysely<unknown>, "audit_log_request_idx")).toEqual([
      "request_id",
    ]);
  });

  it("is already applied by migrating to the latest, and MySQL can run it again after a failure", async () => {
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
    if (t.dialect !== "mysql") return;
    // MySQL commits each statement: a run that stopped half-way (here, after the first columns)
    // is run again from the start, and skips what's there.
    const db = t.db as Kysely<unknown>;
    await sql`drop index audit_log_request_idx on audit_log`.execute(db);
    await sql`drop index audit_log_workspace_idx on audit_log`.execute(db);
    await sql`alter table audit_log drop column outcome`.execute(db);
    await sql`alter table audit_log drop column workspace_id`.execute(db);
    await auditContext("mysql").up(db);
    expect(await indexes(db)).toEqual(
      expect.arrayContaining(["audit_log_workspace_idx", "audit_log_request_idx"]),
    );
    expect((await row(await insert({ workspace_id: newId() }))).outcome).toBe("success");
    // And over a complete run: every column and index skipped, outcome included.
    await auditContext("mysql").up(db);
  });
});
