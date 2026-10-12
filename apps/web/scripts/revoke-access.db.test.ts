import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/server/db/create-db";

// Runs the real `pnpm run setup` and `pnpm run revoke-access` entry points (098).
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-revoke-cli-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (script: string, args: string[], env: Record<string, string> = {}) => {
  const result = spawnSync("pnpm", ["exec", "tsx", `scripts/${script}.ts`, ...args], {
    cwd: new URL("..", import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
      CI: "",
      RONNE_ENV_FILE: join(dir, ".env"),
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

/** Root's sessions and live tokens, written straight to the database. */
const seed = async () => {
  const { db } = createDb(databaseUrl());
  try {
    const root = await db.selectFrom("user").select("id").executeTakeFirstOrThrow();
    const now = new Date().toISOString();
    for (const n of [1, 2])
      await db
        .insertInto("session")
        .values({
          id: `s${n}`,
          user_id: root.id,
          token: `session-token-${n}`,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          created_at: now,
          updated_at: now,
          ip_address: null,
          user_agent: null,
        })
        .execute();
    await db
      .insertInto("access_tokens")
      .values({
        id: "t1",
        user_id: root.id,
        name: "laptop",
        token_hash: "0".repeat(64),
        token_prefix: "rmk_aaaaaaaa",
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_at: now,
      })
      .execute();
  } finally {
    await db.destroy();
  }
};

const remaining = async () => {
  const { db } = createDb(databaseUrl());
  try {
    const sessions = await db.selectFrom("session").select("id").execute();
    const tokens = await db
      .selectFrom("access_tokens")
      .select("id")
      .where("revoked_at", "is", null)
      .execute();
    return { sessions: sessions.length, tokens: tokens.length };
  } finally {
    await db.destroy();
  }
};

describe("pnpm run revoke-access", () => {
  it("--everyone --yes ends every session and revokes every token, from .env's DATABASE_URL", async () => {
    expect(setUp().code).toBe(0);
    await seed();

    const result = run("revoke-access", ["--everyone", "--yes"]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Ended 2 sessions and revoked 1 access token.");
    expect(await remaining()).toEqual({ sessions: 0, tokens: 0 });

    const again = run("revoke-access", ["--everyone", "--yes"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("Nothing to revoke");
  }, 60_000);

  it("--tokens-only with only sessions left has nothing to do, and leaves the sessions", async () => {
    expect(setUp().code).toBe(0);
    await seed();
    expect(run("revoke-access", ["--everyone", "--tokens-only", "--yes"]).stdout).toContain(
      "Revoked 1 access token.",
    );
    const again = run("revoke-access", ["--everyone", "--tokens-only", "--yes"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain(
      "Nothing to revoke for every account, root's included: no access tokens.",
    );
    expect(await remaining()).toEqual({ sessions: 2, tokens: 0 });
  }, 60_000);

  it("--help prints the usage and exits 0", () => {
    const result = run("revoke-access", ["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--everyone | --user EMAIL");
  }, 60_000);

  it("--user with an unknown email fails and changes nothing", async () => {
    expect(setUp().code).toBe(0);
    await seed();
    const result = run("revoke-access", ["--user", "nobody@example.com", "--yes"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("doesn't exist");
    expect(await remaining()).toEqual({ sessions: 2, tokens: 1 });
  }, 60_000);

  it("--user with something that isn't an email is invalid input (exit 2)", () => {
    expect(setUp().code).toBe(0);
    const result = run("revoke-access", ["--user", "not-an-email", "--yes"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Invalid --user");
  }, 60_000);

  it("refuses without --everyone or --user, and without a terminal unless --yes (exit 2)", () => {
    expect(run("revoke-access", ["--yes"]).code).toBe(2);
    const noTerminal = run("revoke-access", ["--everyone"]);
    expect(noTerminal.code).toBe(2);
    expect(noTerminal.stderr).toContain("--yes");
  }, 60_000);
});
