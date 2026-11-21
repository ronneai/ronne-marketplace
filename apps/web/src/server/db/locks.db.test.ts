import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SqliteDatabase from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "./create-db";
import { writeTransaction } from "./locks";
import { migrateToLatest } from "./migrate";
import { createTestDb, type TestDb } from "./testing/test-db";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

describe("writeTransaction (109)", () => {
  it("commits what the work wrote, and rolls it all back when the work throws", async () => {
    const row = (hash: string) => ({
      key_hash: hash,
      window_started_at: new Date(0).toISOString(),
      hits: 1,
      expires_at: new Date(0).toISOString(),
    });
    const values = (hash: string) =>
      t.dialect === "sqlite"
        ? row(hash)
        : { ...row(hash), window_started_at: new Date(0), expires_at: new Date(0) };
    await writeTransaction(t.db, t.dialect, (trx) =>
      trx.insertInto("rate_limits").values(values("a")).execute(),
    );
    await expect(
      writeTransaction(t.db, t.dialect, async (trx) => {
        await trx.insertInto("rate_limits").values(values("b")).execute();
        throw new Error("no");
      }),
    ).rejects.toThrow("no");
    const hashes = await t.db.selectFrom("rate_limits").select("key_hash").execute();
    expect(hashes.map((h) => h.key_hash)).toEqual(["a"]);
  });

  it("on SQLite, holds the write lock from its start, before anything is written", async () => {
    if (t.dialect !== "sqlite") return;
    const dir = mkdtempSync(join(tmpdir(), "ronne-locks-"));
    const file = join(dir, "locks.db");
    const { db } = createDb(`file:${file}`);
    try {
      await migrateToLatest(db, "sqlite");
      // Another process's connection, which won't wait: a write lock held elsewhere is SQLITE_BUSY.
      const other = new SqliteDatabase(file);
      other.pragma("busy_timeout = 0");
      try {
        let seen: unknown = null;
        await writeTransaction(db, "sqlite", async (trx) => {
          await trx.selectFrom("rate_limits").selectAll().execute();
          try {
            other.exec("begin immediate; rollback");
          } catch (error) {
            seen = error;
          }
        });
        expect((seen as { code?: string } | null)?.code).toBe("SQLITE_BUSY");
        // Once it ended, the lock is free again.
        other.exec("begin immediate; rollback");
      } finally {
        other.close();
      }
    } finally {
      await db.destroy();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
