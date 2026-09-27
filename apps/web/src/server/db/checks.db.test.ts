import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkConnection, checkPermissions, PROBE_TABLE } from "./checks";
import { createDb } from "./create-db";
import { createTestDb } from "./testing/test-db";

const dir = mkdtempSync(join(tmpdir(), "ronne-checks-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("checkConnection", () => {
  it("connects to SQLite and reports its version", async () => {
    const result = await checkConnection(`file:${join(dir, "ok.db")}`);
    expect(result).toMatchObject({ ok: true, dialect: "sqlite" });
    expect(result.ok && result.serverVersion).toMatch(/^3\./);
  });

  it("reports a malformed URL as invalid_url, without the password", async () => {
    const result = await checkConnection("mongodb://ronne:hunter2@db/ronne");
    expect(result).toMatchObject({ ok: false, kind: "invalid_url" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it.each([
    ["PostgreSQL", "postgres://ronne:secret@127.0.0.1:1/ronne"],
    ["MySQL", "mysql://ronne:secret@127.0.0.1:1/ronne"],
  ])("reports a closed %s port as unreachable", async (_label, url) => {
    expect(await checkConnection(url)).toMatchObject({ ok: false, kind: "unreachable" });
  });
});

describe("checkPermissions", () => {
  it("creates, writes, reads and drops the probe table, leaving nothing behind", async () => {
    const { db, dialect, cleanup } = await createTestDb({ migrate: false });
    expect(await checkPermissions(db, dialect)).toEqual({ ok: true });
    const tables = (await db.introspection.getTables()).map((t) => t.name);
    expect(tables).not.toContain(PROBE_TABLE);
    await cleanup();
  });

  it("reports the create step on a read-only database file", async () => {
    const file = join(dir, "readonly.db");
    const writable = createDb(`file:${file}`);
    await writable.db.destroy();
    chmodSync(file, 0o444);

    const { db, dialect } = createDb(`file:${file}`);
    const result = await checkPermissions(db, dialect);
    await db.destroy();
    chmodSync(file, 0o644);

    expect(result).toMatchObject({ ok: false, step: "create" });
    expect(result.ok || result.message).toMatch(/readonly/i);
  });
});

// With TEST_DATABASE_URL set to MySQL/MariaDB or PostgreSQL (004's CI matrix), check the server cases.
const serverUrl = process.env.TEST_DATABASE_URL;
const isServer = !!serverUrl && !serverUrl.startsWith("file:");

describe.skipIf(!isServer)("checkConnection against a server", () => {
  const url = new URL(serverUrl ?? "postgres://x@x/x");
  const variant = (change: (u: URL) => void) => {
    const copy = new URL(url);
    change(copy);
    return copy.toString();
  };

  it("connects and reports the server version", async () => {
    expect(await checkConnection(url.toString())).toMatchObject({ ok: true });
  });

  it("reports a wrong password as auth_failed", async () => {
    const result = await checkConnection(
      variant((u) => {
        u.password = "definitely-wrong";
      }),
    );
    expect(result).toMatchObject({ ok: false, kind: "auth_failed" });
  });

  it("reports a missing database as database_missing", async () => {
    const result = await checkConnection(
      variant((u) => {
        u.pathname = "/ronne_missing_database";
      }),
    );
    expect(result).toMatchObject({ ok: false, kind: "database_missing" });
  });

  it("passes the permission check", async () => {
    const { db, dialect } = createDb(url.toString());
    expect(await checkPermissions(db, dialect)).toEqual({ ok: true });
    await db.destroy();
  });
});
