import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "./create-db";

describe("createDb with SQLite", () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  it("connects to an in-memory database", async () => {
    const { db, dialect } = createDb("file::memory:");
    cleanups.push(() => db.destroy());

    expect(dialect).toBe("sqlite");
    const { rows } = await sql<{ one: number }>`select 1 as one`.execute(db);
    expect(rows).toEqual([{ one: 1 }]);
  });

  it("creates the folder for a file database and turns on foreign keys and WAL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ronne-db-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const { db } = createDb("file:./nested/folder/ronne.db", { baseDir: dir });
    cleanups.unshift(() => db.destroy());

    const fk = await sql<{ foreign_keys: number }>`pragma foreign_keys`.execute(db);
    const wal = await sql<{ journal_mode: string }>`pragma journal_mode`.execute(db);
    expect(fk.rows[0]?.foreign_keys).toBe(1);
    expect(wal.rows[0]?.journal_mode).toBe("wal");
  });
});
