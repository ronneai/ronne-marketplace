import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
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
import { createDb } from "../src/server/db/create-db";

// Runs the real `pnpm run setup` and `pnpm run rotate-secret` entry points (098). rotate-secret runs
// as rmk-server runs it (RONNE_RUNTIME=npm): in a clone it would also look at this checkout's own
// apps/web/.env, which the clone checks in rotate-secret.test.ts cover with a scratch folder.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-rotate-cli-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const envPath = () => join(dir, ".env");

const run = (script: string, args: string[], env: Record<string, string> = {}) => {
  const result = spawnSync("pnpm", ["exec", "tsx", `scripts/${script}.ts`, ...args], {
    cwd: new URL("..", import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
      CI: "",
      RONNE_ENV_FILE: envPath(),
      ...(script === "rotate-secret" ? { RONNE_RUNTIME: "npm" } : {}),
      ...env,
    },
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

const databaseUrl = () => `file:${join(dir, "ronne.db")}`;
const setUp = () =>
  run("setup", ["--yes"], {
    DATABASE_URL: databaseUrl(),
    STORAGE_PATH: join(dir, "storage"),
    PUBLIC_URL: "http://localhost:3000",
    RONNE_ROOT_EMAIL: "root@example.com",
    RONNE_ROOT_NAME: "Root",
    RONNE_ROOT_PASSWORD: "correct horse battery",
  });

const secret = () => parseEnv(readFileSync(envPath(), "utf8")).AUTH_SECRET;

const query = async <T>(work: (db: ReturnType<typeof createDb>["db"]) => Promise<T>) => {
  const { db } = createDb(databaseUrl());
  try {
    return await work(db);
  } finally {
    await db.destroy();
  }
};

const addSession = () =>
  query(async (db) => {
    const root = await db.selectFrom("user").select("id").executeTakeFirstOrThrow();
    const now = new Date().toISOString();
    await db
      .insertInto("session")
      .values({
        id: "s1",
        user_id: root.id,
        token: "session-token-1",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        created_at: now,
        updated_at: now,
        ip_address: null,
        user_agent: null,
      })
      .execute();
  });

describe("pnpm run rotate-secret", () => {
  it("--yes writes a new AUTH_SECRET, keeps every other line and the mode, and ends sessions", async () => {
    expect(setUp().code).toBe(0);
    appendFileSync(envPath(), "# a comment someone wrote\nOTHER_KEY=keep me");
    await addSession();
    const before = readFileSync(envPath(), "utf8");
    const old = secret();

    const result = run("rotate-secret", ["--yes"]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "Wrote a new AUTH_SECRET to the settings file and ended 1 session.",
    );
    expect(result.stdout).toContain("The server uses the new secret from its next request.");

    const now = secret();
    expect(now).toBeTruthy();
    expect(now).not.toBe(old);
    expect(now?.length).toBeGreaterThanOrEqual(32);
    // Only the AUTH_SECRET line changed.
    const after = readFileSync(envPath(), "utf8");
    expect(after.replace(`AUTH_SECRET=${now}`, "")).toBe(before.replace(`AUTH_SECRET=${old}`, ""));
    expect(statSync(envPath()).mode & 0o777).toBe(0o600);
    // Neither secret is printed.
    for (const value of [old, now]) {
      expect(result.stdout).not.toContain(value);
      expect(result.stderr).not.toContain(value);
    }

    expect(await query((db) => db.selectFrom("session").select("id").execute())).toEqual([]);
    const events = await query((db) =>
      db
        .selectFrom("audit_log")
        .select(["action", "metadata"])
        .where("action", "=", "instance.secret_rotated")
        .execute(),
    );
    expect(events).toHaveLength(1);
    for (const value of [old, now]) expect(JSON.stringify(events)).not.toContain(value);
  }, 60_000);

  it("a duplicate AUTH_SECRET line can't keep the old secret in effect", async () => {
    expect(setUp().code).toBe(0);
    appendFileSync(envPath(), "AUTH_SECRET=a-duplicate-line-a-duplicate-line-0001\n");
    expect(run("rotate-secret", ["--yes"]).code).toBe(0);
    const after = readFileSync(envPath(), "utf8");
    expect(after.match(/AUTH_SECRET=/g)).toHaveLength(1);
    expect(secret()).not.toBe("a-duplicate-line-a-duplicate-line-0001");
  }, 60_000);

  it("refuses a secret it can't replace safely, and changes nothing", async () => {
    expect(setUp().code).toBe(0);
    await addSession();
    // An AUTH_SECRET line inside a multi-line value comes first.
    const before = `M="x\nAUTH_SECRET=inside\ny"\n${readFileSync(envPath(), "utf8")}`;
    writeFileSync(envPath(), before);
    const result = run("rotate-secret", ["--yes"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("isn't a plain KEY=value line");
    expect(readFileSync(envPath(), "utf8")).toBe(before);
    expect(await query((db) => db.selectFrom("session").select("id").execute())).toHaveLength(1);
  }, 60_000);

  it.skipIf(process.getuid?.() === 0)(
    "a settings file it can't write: a plain message without the path, and nothing changed",
    async () => {
      expect(setUp().code).toBe(0);
      await addSession();
      // The settings in a folder of their own, as a service's are (/etc/rmk-server), neither writable.
      const etc = join(dir, "etc");
      mkdirSync(etc);
      const settings = join(etc, "env");
      const before = readFileSync(envPath(), "utf8");
      writeFileSync(settings, before, { mode: 0o400 });
      chmodSync(etc, 0o555);
      try {
        const result = run("rotate-secret", ["--yes"], { RONNE_ENV_FILE: settings });
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("The settings file couldn't be written (EACCES)");
        expect(`${result.stdout}${result.stderr}`).not.toContain(etc);
      } finally {
        chmodSync(etc, 0o755);
      }
      expect(readFileSync(settings, "utf8")).toBe(before);
      expect(await query((db) => db.selectFrom("session").select("id").execute())).toHaveLength(1);
    },
    60_000,
  );

  it("refuses when AUTH_SECRET comes from the environment, and changes nothing", async () => {
    expect(setUp().code).toBe(0);
    await addSession();
    const before = readFileSync(envPath(), "utf8");
    const result = run("rotate-secret", ["--yes"], {
      AUTH_SECRET: "from-the-environment-from-the-environment",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("AUTH_SECRET is set in the environment");
    expect(result.stderr).not.toContain("from-the-environment");
    expect(readFileSync(envPath(), "utf8")).toBe(before);
    expect(await query((db) => db.selectFrom("session").select("id").execute())).toHaveLength(1);
  }, 60_000);

  it("refuses before setup (exit 1)", () => {
    writeFileSync(envPath(), "PUBLIC_URL=http://localhost:3000\n");
    const result = run("rotate-secret", ["--yes"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("isn't set up yet");
  }, 60_000);

  it("--help prints the usage; without a terminal it needs --yes (exit 2)", () => {
    const help = run("rotate-secret", ["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: rotate-secret [--yes]");
    const noTerminal = run("rotate-secret", []);
    expect(noTerminal.code).toBe(2);
    expect(noTerminal.stderr).toContain("--yes");
  }, 60_000);
});
