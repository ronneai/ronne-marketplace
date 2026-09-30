import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../config";
import { createDb } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { createRoot } from "../domains/identity/actions/root-account";
import { getSetupState, markSetupReady, resetSetupState } from "./state";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb({ migrate: false });
  resetSetupState();
});
afterEach(async () => {
  resetSetupState();
  await t.cleanup();
});

const config = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  envFile: "/nowhere/.env",
  databaseUrl: t.url,
  authSecret: "secret",
  storagePath: "./data/storage",
  trustProxy: false,
  ...overrides,
});
const getDb = () => ({ db: t.db, dialect: t.dialect });
const root = { email: "root@example.com", name: "Root", password: "correct horse battery" };

describe("getSetupState", () => {
  it("is not_configured without a database URL or a secret, before touching the database", async () => {
    const mustNotConnect = () => {
      throw new Error("must not connect");
    };
    expect(await getSetupState(config({ databaseUrl: undefined }), { getDb: mustNotConnect })).toBe(
      "not_configured",
    );
    expect(await getSetupState(config({ authSecret: undefined }), { getDb: mustNotConnect })).toBe(
      "not_configured",
    );
  });

  it("is incomplete until the tables and the root account exist, then ready", async () => {
    expect(await getSetupState(config(), { getDb })).toBe("incomplete");
    await migrateToLatest(t.db, t.dialect);
    expect(await getSetupState(config(), { getDb })).toBe("incomplete");
    await createRoot(t.db, t.dialect, root);
    expect(await getSetupState(config(), { getDb })).toBe("ready");
  });

  it("is unavailable when the database doesn't answer", async () => {
    const closedPort = () => createDb("postgres://ronne:secret@127.0.0.1:1/ronne");
    expect(await getSetupState(config(), { getDb: closedPort })).toBe("unavailable");
    const throwing = () => {
      throw new Error("connect ECONNREFUSED");
    };
    expect(await getSetupState(config(), { getDb: throwing })).toBe("unavailable");
  });

  it("remembers ready per database URL only when asked, as production does", async () => {
    await migrateToLatest(t.db, t.dialect);
    await createRoot(t.db, t.dialect, root);
    const throwing = () => {
      throw new Error("must not connect");
    };

    expect(await getSetupState(config(), { getDb, remember: false })).toBe("ready");
    expect(await getSetupState(config(), { getDb: throwing, remember: false })).toBe("unavailable");

    expect(await getSetupState(config(), { getDb, remember: true })).toBe("ready");
    expect(await getSetupState(config(), { getDb: throwing, remember: true })).toBe("ready");
    expect(
      await getSetupState(config({ databaseUrl: "file:./other.db" }), {
        getDb: throwing,
        remember: true,
      }),
    ).toBe("unavailable");

    resetSetupState();
    expect(await getSetupState(config(), { getDb: throwing, remember: true })).toBe("unavailable");
    markSetupReady(t.url, true);
    expect(await getSetupState(config(), { getDb: throwing, remember: true })).toBe("ready");
  });
});
