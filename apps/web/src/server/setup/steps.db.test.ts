import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { DatabaseAheadOfAppError, migrateToLatest } from "../db/migrate";
import { createTestDb } from "../db/testing/test-db";
import { listAuditEvents } from "../domains/audit/actions/audit";
import { RootAlreadyExistsError } from "../domains/identity/exceptions/errors";
import {
  applyMigrations,
  checkDatabase,
  createRootAccount,
  describeServer,
  findRootAccount,
  formatProblem,
  writeSettings,
} from "./steps";

let appDir: string;
beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), "ronne-steps-"));
});
afterEach(() => rmSync(appDir, { recursive: true, force: true }));

const onServer = Boolean(process.env.TEST_DATABASE_URL?.match(/^(postgres|mysql)/));
const root = { email: "Root@Example.com", name: "Root", password: "correct horse battery" };

/**
 * A database the steps can open by URL: the steps open their own connections, so the in-memory
 * SQLite `createTestDb` gives by default would be a different, empty database each time.
 */
const freshDatabase = async (options: { migrate: boolean }) => {
  if (onServer) return createTestDb(options);
  const url = `file:${join(appDir, "steps.db")}`;
  const { db, dialect } = createDb(url);
  if (options.migrate) await migrateToLatest(db, dialect);
  return { db, dialect, url, cleanup: () => db.destroy() };
};

describe("checkDatabase", () => {
  it("accepts a SQLite file, relative to the app folder, and reports the version", async () => {
    const check = await checkDatabase("file:./data/ok.db", { appDir });
    expect(check).toMatchObject({ ok: true, dialect: "sqlite", warning: undefined });
    expect(check.ok && check.serverVersion).toMatch(/^3\./);
    expect(existsSync(join(appDir, "data/ok.db"))).toBe(true);
  });

  it("explains a malformed URL without the password", async () => {
    const check = await checkDatabase("mongodb://ronne:hunter2@db/ronne", { appDir });
    expect(check).toMatchObject({ ok: false, problem: { kind: "invalid_url" } });
    expect(JSON.stringify(check)).not.toContain("hunter2");
    if (check.ok) throw new Error("unreachable");
    expect(formatProblem(check.problem)).toMatch(
      /^The connection details don't form a valid database URL\.\n/,
    );
  });

  it.each([
    ["PostgreSQL", "postgres://ronne:secret@127.0.0.1:1/ronne"],
    ["MySQL", "mysql://ronne:secret@127.0.0.1:1/ronne"],
  ])("explains a closed %s port as unreachable", async (_label, url) => {
    const check = await checkDatabase(url, { appDir });
    expect(check).toMatchObject({
      ok: false,
      problem: { kind: "unreachable", explanation: expect.stringContaining("Couldn't reach") },
    });
  });

  it("reports the permission step on a read-only SQLite file", async () => {
    const file = join(appDir, "readonly.db");
    const writable = createDb(`file:${file}`);
    await writable.db.destroy();
    chmodSync(file, 0o444);
    const check = await checkDatabase(`file:${file}`, { appDir });
    expect(check).toMatchObject({
      ok: false,
      problem: { kind: "permissions", explanation: expect.stringContaining("can't create") },
    });
  });

  it.skipIf(!onServer)("explains a wrong password and a missing database on a server", async () => {
    const t = await createTestDb({ migrate: false });
    try {
      const good = await checkDatabase(t.url, { appDir });
      expect(good).toMatchObject({ ok: true, dialect: t.dialect });

      const wrongPassword = new URL(t.url);
      wrongPassword.password = "not-the-password";
      expect(await checkDatabase(wrongPassword.toString(), { appDir })).toMatchObject({
        ok: false,
        problem: { kind: "auth_failed", explanation: expect.stringContaining("refused") },
      });

      const missing = new URL(t.url);
      missing.pathname = "/ronne_test_does_not_exist";
      expect(await checkDatabase(missing.toString(), { appDir })).toMatchObject({
        ok: false,
        problem: { kind: "database_missing", explanation: expect.stringContaining("no database") },
      });
    } finally {
      await t.cleanup();
    }
  });
});

describe("describeServer", () => {
  it("names the product with the version a server reports", () => {
    expect(describeServer({ dialect: "sqlite", serverVersion: "3.45.0" })).toBe("SQLite");
    expect(describeServer({ dialect: "postgres", serverVersion: "15.14" })).toBe(
      "PostgreSQL 15.14",
    );
    expect(describeServer({ dialect: "mysql", serverVersion: "8.4.3" })).toBe("MySQL 8.4.3");
    expect(describeServer({ dialect: "mysql", serverVersion: "11.4.2-MariaDB" })).toBe(
      "MariaDB 11.4.2",
    );
  });
});

describe("writeSettings", () => {
  const envPath = () => join(appDir, ".env");

  it("writes the four keys with mode 0600, creates the storage folder, and needs no restart", () => {
    const written = writeSettings({
      appDir,
      envPath: envPath(),
      databaseUrl: "file:./data/ronne.db",
      publicUrl: "http://localhost:3000",
      env: {},
    });
    expect(written).toEqual({
      envPath: envPath(),
      storagePath: "./data/storage",
      weakSecret: false,
      restartNeeded: false,
    });
    const env = parseEnv(readFileSync(envPath(), "utf8"));
    expect(env).toMatchObject({
      DATABASE_URL: "file:./data/ronne.db",
      STORAGE_PATH: "./data/storage",
      PUBLIC_URL: "http://localhost:3000",
    });
    expect(Buffer.from(env.AUTH_SECRET as string, "base64")).toHaveLength(32);
    expect(statSync(envPath()).mode & 0o777).toBe(0o600);
    expect(existsSync(join(appDir, "data/storage"))).toBe(true);
  });

  it("keeps an existing AUTH_SECRET and flags a weak one", () => {
    const first = writeSettings({
      appDir,
      envPath: envPath(),
      databaseUrl: "file:./a.db",
      publicUrl: "http://a.test",
      env: {},
    });
    expect(first.weakSecret).toBe(false);
    const secret = parseEnv(readFileSync(envPath(), "utf8")).AUTH_SECRET;

    const second = writeSettings({
      appDir,
      envPath: envPath(),
      databaseUrl: "file:./b.db",
      publicUrl: "http://b.test",
      env: {},
    });
    expect(second.weakSecret).toBe(false);
    expect(parseEnv(readFileSync(envPath(), "utf8"))).toMatchObject({
      AUTH_SECRET: secret,
      DATABASE_URL: "file:./b.db",
    });

    const weakPath = join(appDir, "weak.env");
    writeSettings({
      appDir,
      envPath: weakPath,
      databaseUrl: "file:./c.db",
      publicUrl: "http://c.test",
      env: {},
    });
    const content = readFileSync(weakPath, "utf8").replace(
      /^AUTH_SECRET=.*$/m,
      "AUTH_SECRET=short",
    );
    writeFileSync(weakPath, content);
    expect(
      writeSettings({
        appDir,
        envPath: weakPath,
        databaseUrl: "file:./c.db",
        publicUrl: "http://c.test",
        env: {},
      }).weakSecret,
    ).toBe(true);
  });

  it("says a restart is needed when the process environment shadows what was written", () => {
    const shadowed = writeSettings({
      appDir,
      envPath: envPath(),
      databaseUrl: "file:./data/ronne.db",
      publicUrl: "https://ronne.example",
      env: { PUBLIC_URL: "http://localhost:3000" },
    });
    expect(shadowed.restartNeeded).toBe(true);

    const same = writeSettings({
      appDir,
      envPath: envPath(),
      databaseUrl: "file:./data/ronne.db",
      publicUrl: "https://ronne.example",
      env: { PUBLIC_URL: "https://ronne.example", DATABASE_URL: "" },
    });
    expect(same.restartNeeded).toBe(false);
  });
});

describe("applyMigrations, findRootAccount and createRootAccount", () => {
  it("migrates once, then reports the database as up to date", async () => {
    const t = await freshDatabase({ migrate: false });
    try {
      const first = await applyMigrations(t.url, { appDir });
      expect(first.applied.length).toBeGreaterThan(0);
      expect(await applyMigrations(t.url, { appDir })).toEqual({ applied: [] });
    } finally {
      await t.cleanup();
    }
  });

  it("lets a database migrated by a newer version through as DatabaseAheadOfAppError", async () => {
    const t = await freshDatabase({ migrate: false });
    try {
      await migrateToLatest(t.db, t.dialect, {
        "0001_identity": () => ({ up: async () => {} }),
        "0099_future": () => ({ up: async () => {} }),
      });
      await expect(applyMigrations(t.url, { appDir })).rejects.toThrowError(
        DatabaseAheadOfAppError,
      );
    } finally {
      await t.cleanup();
    }
  });

  it("creates root once, from the web with the client's address, then refuses", async () => {
    const t = await freshDatabase({ migrate: true });
    try {
      expect(await findRootAccount(t.url, { appDir })).toBeNull();
      const created = await createRootAccount(t.url, { appDir }, root, {
        via: "web",
        ipAddress: "203.0.113.9",
      });
      expect(created.email).toBe("root@example.com");
      expect(await findRootAccount(t.url, { appDir })).toMatchObject({ email: "root@example.com" });

      const events = (await listAuditEvents(t.db, t.dialect, {})).events;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: "instance.root_created",
        metadata: { via: "web", email: "root@example.com" },
        ipAddress: "203.0.113.9",
      });

      await expect(
        createRootAccount(
          t.url,
          { appDir },
          { ...root, email: "other@example.com" },
          { via: "cli" },
        ),
      ).rejects.toThrowError(RootAlreadyExistsError);
    } finally {
      await t.cleanup();
    }
  });
});
