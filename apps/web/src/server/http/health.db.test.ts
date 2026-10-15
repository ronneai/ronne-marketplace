import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppConfig } from "../config";
import type { Database } from "../db/schema";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { createRoot } from "../domains/identity/actions/root-account";
import { setLoggerForTests } from "../log";
import { localStorage } from "../storage/local-storage";
import type { StorageAdapter } from "../storage/storage-adapter";
import { hooks, installHooks } from "../telemetry/hooks";
import { health } from "./health";

let t: TestDb;
let empty: TestDb;
let folder: string;
beforeAll(async () => {
  t = await createTestDb();
  await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  empty = await createTestDb({ migrate: false });
  folder = mkdtempSync(join(tmpdir(), "ronne-health-"));
});
afterAll(async () => {
  rmSync(folder, { recursive: true, force: true });
  await t.cleanup();
  await empty.cleanup();
});

const storage = () => localStorage(folder);
const mustNotCheck = (): StorageAdapter => {
  throw new Error("must not check storage");
};
const db = () => ({ db: t.db, dialect: t.dialect });

const config = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  envFile: "/nowhere/.env",
  databaseUrl: t.url,
  authSecret: "secret",
  storagePath: "./data/storage",
  trustProxy: false,
  ...overrides,
});

/** A database whose every query fails (`fail`) or never answers. */
const brokenDb = (fail: boolean) => {
  const connection = {
    executeQuery: () =>
      fail ? Promise.reject(new Error("connection lost")) : new Promise<never>(() => {}),
    streamQuery: () => {
      throw new Error("not used");
    },
  };
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createIntrospector: (k) => new SqliteIntrospector(k),
      createQueryCompiler: () => new SqliteQueryCompiler(),
      createDriver: () => ({
        init: async () => {},
        acquireConnection: async () => connection,
        beginTransaction: async () => {},
        commitTransaction: async () => {},
        rollbackTransaction: async () => {},
        releaseConnection: async () => {},
        destroy: async () => {},
      }),
    },
  });
};
const rejecting = () => brokenDb(true);

describe("health", () => {
  it("is ok when the database answers", async () => {
    const response = await health(config(), db, storage);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { database: "ok", storage: "ok" },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 setup_required while the settings exist but the database has no tables or root", async () => {
    const response = await health(
      config({ databaseUrl: empty.url }),
      () => ({ db: empty.db, dialect: empty.dialect }),
      mustNotCheck,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "setup_required" } });
  });

  it("returns 503 setup_required before setup", async () => {
    const response = await health(
      config({ databaseUrl: undefined, authSecret: undefined }),
      () => {
        throw new Error("must not connect");
      },
      mustNotCheck,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "setup_required" } });
  });

  it("returns 503 database_unavailable, without the driver's message, when the database fails", async () => {
    const response = await health(
      config({ databaseUrl: "postgres://ronne:secret@127.0.0.1:1/ronne" }),
      () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:1 (with secret details)");
      },
      mustNotCheck,
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "database_unavailable" } });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });

  it("writes db.unavailable when the database fails, never the database's password", async () => {
    const lines: Record<string, unknown>[] = [];
    setLoggerForTests({
      level: "info",
      format: "json",
      write: (line) => lines.push(JSON.parse(line)),
    });
    try {
      await health(
        config({ databaseUrl: "postgres://ronne:s3cr3tpw@127.0.0.1:1/ronne" }),
        () => {
          throw new Error("connect ECONNREFUSED postgres://ronne:s3cr3tpw@127.0.0.1:1/ronne");
        },
        mustNotCheck,
      );
    } finally {
      setLoggerForTests();
    }
    expect(lines).toEqual([
      expect.objectContaining({ level: "error", event: "db.unavailable", domain: "db" }),
    ]);
    expect(JSON.stringify(lines)).not.toContain("s3cr3tpw");
  });

  // Storage (101): checked after the database, with the same 3-second limit.
  const unavailableStorage = {
    status: 503,
    body: {
      error: {
        code: "storage_unavailable",
        message: "Storage isn't writable.",
        details: { checks: { database: "ok", storage: "failed" } },
      },
    },
  };
  const answer = async (response: Response) => ({
    status: response.status,
    body: await response.json(),
  });

  it("is ok while the storage folder doesn't exist yet, when its parent can take it", async () => {
    // A STORAGE_PATH nothing has made yet: the first put creates it.
    const notYet = join(folder, "not-yet", "storage");
    expect((await health(config(), db, () => localStorage(notYet))).status).toBe(200);
  });

  // Root may write anywhere, so a read-only folder only shows as one to anyone else.
  const asRoot = process.getuid?.() === 0;

  it.skipIf(asRoot)(
    "returns 503 storage_unavailable when the storage folder is missing and can't be made",
    async () => {
      const readOnly = mkdtempSync(join(folder, "parent-"));
      chmodSync(readOnly, 0o555);
      try {
        const gone = join(readOnly, "storage");
        expect(await answer(await health(config(), db, () => localStorage(gone)))).toEqual(
          unavailableStorage,
        );
      } finally {
        chmodSync(readOnly, 0o755);
      }
    },
  );

  it("returns 503 storage_unavailable when the storage path is a file", async () => {
    const file = join(folder, "a-file");
    writeFileSync(file, "x");
    expect(await answer(await health(config(), db, () => localStorage(file)))).toEqual(
      unavailableStorage,
    );
    // An executable file too: writable and "searchable", still not a folder.
    const executable = join(folder, "an-executable-file");
    writeFileSync(executable, "x");
    chmodSync(executable, 0o755);
    expect(await answer(await health(config(), db, () => localStorage(executable)))).toEqual(
      unavailableStorage,
    );
  });

  it.skipIf(asRoot)(
    "returns 503 storage_unavailable when the storage folder is read-only",
    async () => {
      const readOnly = mkdtempSync(join(folder, "read-only-"));
      chmodSync(readOnly, 0o555);
      try {
        expect(await answer(await health(config(), db, () => localStorage(readOnly)))).toEqual(
          unavailableStorage,
        );
      } finally {
        chmodSync(readOnly, 0o755);
      }
    },
  );

  // Real timers: the database drivers (pg, mysql2) use them too, so faked ones would stop the
  // database's own check on a server.
  // One 4-second deadline for the whole check, under the Dockerfile's 5-second HEALTHCHECK timeout:
  // storage gets what the database left, never a second full limit.
  it("returns 503 storage_unavailable when storage doesn't answer by the deadline", async () => {
    const hanging = { ...storage(), check: () => new Promise<void>(() => {}) };
    const started = performance.now();
    expect(await answer(await health(config(), db, () => hanging))).toEqual(unavailableStorage);
    const took = performance.now() - started;
    expect(took).toBeGreaterThanOrEqual(3_900);
    expect(took).toBeLessThan(4_500);
  }, 10_000);

  it("returns 503 database_unavailable within 3 seconds when the database never answers", async () => {
    // A database whose every query hangs: the setup state can't come in.
    const hung = brokenDb(false);
    const started = performance.now();
    const response = await health(config(), () => ({ db: hung, dialect: "sqlite" }), mustNotCheck);
    const took = performance.now() - started;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "database_unavailable" } });
    expect(took).toBeGreaterThanOrEqual(2_900);
    expect(took).toBeLessThan(3_500);
  }, 10_000);

  it("writes storage.unavailable with the error, its path under storage hidden", async () => {
    const lines: Record<string, unknown>[] = [];
    setLoggerForTests({
      level: "info",
      format: "json",
      write: (line) => lines.push(JSON.parse(line)),
    });
    try {
      const file = join(folder, "a-file-for-log");
      writeFileSync(file, "x");
      await health(config(), db, () => localStorage(join(file, "storage")));
    } finally {
      setLoggerForTests();
    }
    expect(lines).toEqual([
      expect.objectContaining({ level: "error", event: "storage.unavailable", domain: "storage" }),
    ]);
    // The storage folder's path is hidden in the error, as any path under it is.
    expect(JSON.stringify(lines)).not.toContain("a-file-for-log/storage");
  });

  // ronne.health (101): each check's result, whichever way the endpoint answers.
  it("sets ronne.health for each check, a database down before the query too", async () => {
    const checks: [string, boolean][] = [];
    installHooks({ ...hooks(), health: (check, ok) => checks.push([check, ok]) });
    try {
      await health(config(), db, storage);
      const file = join(folder, "a-file-for-health");
      writeFileSync(file, "x");
      await health(config(), db, () => localStorage(join(file, "x")));
      // The setup state says ready, then the database's own check fails (the second getDb).
      let calls = 0;
      await health(
        config(),
        () =>
          ++calls === 1 ? { db: t.db, dialect: t.dialect } : { db: rejecting(), dialect: "sqlite" },
        mustNotCheck,
      );
      expect(calls).toBe(2);
      // The setup state can't reach the database: answered before any query.
      await health(
        config({ databaseUrl: "file:/nonexistent/dir/x.db" }),
        () => {
          throw new Error("down");
        },
        mustNotCheck,
      );
    } finally {
      installHooks(undefined);
    }
    expect(checks).toEqual([
      ["database", true],
      ["storage", true],
      ["database", true],
      ["storage", false],
      ["database", false],
      ["database", false],
    ]);
  });
});
