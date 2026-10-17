import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/server/db/create-db";
import { toDbBoolean } from "../src/server/db/dates";
import {
  decryptSecret,
  encryptSecret,
} from "../src/server/domains/identity/repositories/provider-secrets";

// Feature 106, task 8: the real `disable-sso`, `rotate-secret`, `backup` and `restore` entry
// points, as rmk-server runs them (RONNE_RUNTIME=npm, each instance's data folder in
// RONNE_DATA_DIR), on SQLite files.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-sso-cli-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (script: string, args: string[], data: string, env: Record<string, string> = {}) => {
  const result = spawnSync("pnpm", ["exec", "tsx", `scripts/${script}.ts`, ...args], {
    cwd: new URL("..", import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
      CI: "",
      RONNE_RUNTIME: "npm",
      RONNE_DATA_DIR: data,
      RONNE_ENV_FILE: join(data, ".env"),
      ...env,
    },
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

const dbUrl = (data: string) => `file:${join(data, "ronne.db")}`;
const secretOf = (data: string) =>
  parseEnv(readFileSync(join(data, ".env"), "utf8")).AUTH_SECRET as string;

const setUp = (data: string) =>
  run("setup", ["--yes"], data, {
    DATABASE_URL: dbUrl(data),
    STORAGE_PATH: join(data, "storage"),
    PUBLIC_URL: "http://localhost:7650",
    RONNE_ROOT_EMAIL: "root@example.com",
    RONNE_ROOT_NAME: "Root",
    RONNE_ROOT_PASSWORD: "correct horse battery",
  });

const query = async <T>(
  data: string,
  work: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
) => {
  const { db } = createDb(dbUrl(data));
  try {
    return await work(db);
  } finally {
    await db.destroy();
  }
};

/** A provider that's on, with its client secret sealed under this instance's AUTH_SECRET. */
const addProvider = (data: string, id: string) =>
  query(data, async (db) => {
    const now = new Date().toISOString();
    await db
      .insertInto("identity_providers")
      .values({
        id,
        type: "oidc",
        preset: "okta",
        name: id,
        enabled: toDbBoolean(true, "sqlite"),
        config: "{}",
        secret_enc: encryptSecret(secretOf(data), id, `${id}-client-secret`),
        domains: "[]",
        groups_claim: null,
        tested_at: now,
        tested_by: null,
        last_signed_in_at: null,
        last_failure_at: null,
        last_failure_reason: null,
        created_by: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
  });

const setRootOnly = (data: string) =>
  query(data, (db) =>
    db
      .insertInto("instance_settings")
      .values({
        key: "password_sign_in",
        value: "root_only",
        updated_by: null,
        updated_at: new Date().toISOString(),
      })
      .execute(),
  );

describe("pnpm run disable-sso (106)", () => {
  it("turns every provider off and password sign-in back to everyone, audited; then has nothing to do", async () => {
    const data = join(dir, "one");
    expect(setUp(data).code).toBe(0);
    await addProvider(data, "acme");
    await addProvider(data, "beta");
    await setRootOnly(data);

    const done = run("disable-sso", ["--yes"], data);
    expect(done.code, done.stderr).toBe(0);
    expect(done.stdout).toContain("Turned off 2 identity providers: acme, beta.");
    expect(done.stdout).toContain("Everyone may sign in with a password again");

    const state = await query(data, async (db) => ({
      enabled: (await db.selectFrom("identity_providers").select("enabled").execute()).map((r) =>
        Boolean(r.enabled),
      ),
      policy: (
        await db
          .selectFrom("instance_settings")
          .select("value")
          .where("key", "=", "password_sign_in")
          .executeTakeFirst()
      )?.value,
      audit: (
        await db
          .selectFrom("audit_log")
          .select(["action", "metadata"])
          .orderBy("created_at")
          .execute()
      )
        .filter(
          (r) =>
            r.action.startsWith("instance.auth_provider") ||
            r.action === "instance.password_sign_in_changed",
        )
        .map((r) => [r.action, JSON.parse(r.metadata)]),
    }));
    expect(state).toEqual({
      enabled: [false, false],
      policy: "everyone",
      audit: [
        ["instance.auth_provider_disabled", { provider: "acme", via: "cli" }],
        ["instance.auth_provider_disabled", { provider: "beta", via: "cli" }],
        ["instance.password_sign_in_changed", { from: "root_only", to: "everyone", via: "cli" }],
      ],
    });
    // The providers keep their settings and secrets, to turn back on.
    expect(
      await query(data, (db) => db.selectFrom("identity_providers").select("secret_enc").execute()),
    ).toHaveLength(2);

    const again = run("disable-sso", ["--yes"], data);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("Nothing to do");
  });

  it("refuses to run without a terminal unless --yes (2), and says how", () => {
    const data = join(dir, "two");
    expect(setUp(data).code).toBe(0);
    const asked = run("disable-sso", [], data);
    expect(asked.code).toBe(2);
    expect(asked.stderr).toContain("Run it with --yes.");
    const help = run("disable-sso", ["--help"], data);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: disable-sso");
  });
});

describe("rotate-secret, backup and restore keep the providers' secrets (106)", () => {
  it("re-encrypts them under the new AUTH_SECRET, and a backup restored with its settings reads them", async () => {
    const first = join(dir, "first");
    const second = join(dir, "second");
    expect(setUp(first).code).toBe(0);
    await addProvider(first, "acme");
    const old = secretOf(first);

    const rotated = run("rotate-secret", ["--yes"], first);
    expect(rotated.code, rotated.stderr).toBe(0);
    expect(rotated.stdout).toContain(
      "Re-encrypted 1 identity provider secret with the new AUTH_SECRET",
    );
    const fresh = secretOf(first);
    expect(fresh).not.toBe(old);
    const stored = await query(first, (db) =>
      db.selectFrom("identity_providers").select("secret_enc").executeTakeFirstOrThrow(),
    );
    expect(decryptSecret(fresh, "acme", stored.secret_enc as string)).toBe("acme-client-secret");
    expect(() => decryptSecret(old, "acme", stored.secret_enc as string)).toThrow();
    // The secrets are never printed.
    expect(rotated.stdout + rotated.stderr).not.toContain("acme-client-secret");

    expect(run("backup", [], first).code).toBe(0);
    const [name] = readdirSync(join(first, "backups"));
    const restored = run(
      "restore",
      [join(first, "backups", name as string), "--with-settings", "--database-url", dbUrl(second)],
      second,
    );
    expect(restored.code, restored.stderr).toBe(0);
    expect(restored.stdout).not.toContain("can't read its client secret");
    const after = await query(second, (db) =>
      db
        .selectFrom("identity_providers")
        .select(["secret_enc", "last_failure_reason"])
        .executeTakeFirstOrThrow(),
    );
    expect(after.last_failure_reason).toBeNull();
    expect(decryptSecret(secretOf(second), "acme", after.secret_enc as string)).toBe(
      "acme-client-secret",
    );
  });
});
