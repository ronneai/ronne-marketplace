import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { createRoot } from "../domains/identity/actions/root-account";
import { setLoggerForTests } from "../log";
import { localStorage } from "../storage/local-storage";
import type { StorageAdapter } from "../storage/storage-adapter";
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

  it("returns 503 storage_unavailable when the storage folder is missing", async () => {
    const gone = join(folder, "gone");
    expect(await answer(await health(config(), db, () => localStorage(gone)))).toEqual(
      unavailableStorage,
    );
  });

  it("returns 503 storage_unavailable when the storage path is a file", async () => {
    const file = join(folder, "a-file");
    writeFileSync(file, "x");
    expect(await answer(await health(config(), db, () => localStorage(file)))).toEqual(
      unavailableStorage,
    );
  });

  // Root may write anywhere, so a read-only folder only shows as one to anyone else.
  it.skipIf(process.getuid?.() === 0)(
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

  it("returns 503 storage_unavailable when storage doesn't answer within 3 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const hanging = { ...storage(), check: () => new Promise<void>(() => {}) };
      const pending = health(config(), db, () => hanging);
      await vi.advanceTimersByTimeAsync(3_000);
      expect(await answer(await pending)).toEqual(unavailableStorage);
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes storage.unavailable with the error, its path under storage hidden", async () => {
    const lines: Record<string, unknown>[] = [];
    setLoggerForTests({
      level: "info",
      format: "json",
      write: (line) => lines.push(JSON.parse(line)),
    });
    try {
      await health(config(), db, () => localStorage(join(folder, "missing-for-log")));
    } finally {
      setLoggerForTests();
    }
    expect(lines).toEqual([
      expect.objectContaining({ level: "error", event: "storage.unavailable", domain: "storage" }),
    ]);
  });
});
