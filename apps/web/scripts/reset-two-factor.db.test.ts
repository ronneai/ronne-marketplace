import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/server/db/create-db";
import { toDbBoolean } from "../src/server/db/dates";

// Runs the real `pnpm run setup`, `reset-two-factor` and `reset-root-password` entry points (105).
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-two-factor-cli-"));
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

/** Root with two-factor on and a session, written straight to the database. */
const enrolRoot = async () => {
  const { db } = createDb(databaseUrl());
  try {
    const root = await db.selectFrom("user").select("id").executeTakeFirstOrThrow();
    const now = new Date().toISOString();
    await db
      .updateTable("user")
      .set({ two_factor_enabled: toDbBoolean(true, "sqlite") })
      .where("id", "=", root.id)
      .execute();
    await db
      .insertInto("two_factor")
      .values({
        id: "tf-1",
        user_id: root.id,
        secret: "encrypted",
        backup_codes: "encrypted",
        verified: toDbBoolean(true, "sqlite"),
      })
      .execute();
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
  } finally {
    await db.destroy();
  }
};

const state = async () => {
  const { db } = createDb(databaseUrl());
  try {
    const records = await db.selectFrom("two_factor").select("id").execute();
    const sessions = await db.selectFrom("session").select("id").execute();
    const events = await db.selectFrom("audit_log").select(["action", "actor_id"]).execute();
    return {
      records: records.length,
      sessions: sessions.length,
      resets: events.filter((e) => e.action === "user.two_factor_reset"),
    };
  } finally {
    await db.destroy();
  }
};

describe("pnpm run reset-two-factor (105)", () => {
  it("--email --yes turns it off, ends the sessions and records it as the command line", async () => {
    expect(setUp().code).toBe(0);
    await enrolRoot();
    const result = run("reset-two-factor", ["--email", "ROOT@example.com", "--yes"]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "Turned off two-factor sign-in for root@example.com and ended 1 session.",
    );
    expect(await state()).toEqual({
      records: 0,
      sessions: 0,
      resets: [{ action: "user.two_factor_reset", actor_id: null }],
    });

    // Again: nothing to reset, said, and nothing recorded.
    const again = run("reset-two-factor", ["--email", "root@example.com", "--yes"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("root@example.com has no two-factor sign-in: nothing to reset.");
    expect((await state()).resets).toHaveLength(1);
  });

  it("refuses an unknown email (1), a missing one and no terminal without --yes (2)", async () => {
    expect(setUp().code).toBe(0);
    const unknown = run("reset-two-factor", ["--email", "nobody@example.com", "--yes"]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("No account has the email nobody@example.com.");
    const missing = run("reset-two-factor", ["--yes"]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("--email <email>");
    const noTerminal = run("reset-two-factor", ["--email", "root@example.com"]);
    expect(noTerminal.code).toBe(2);
    expect(noTerminal.stderr).toContain("Run it with --yes");
    const help = run("reset-two-factor", ["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: reset-two-factor --email EMAIL [--yes]");
  });

  it("reset-root-password turns root's two-factor off too, and says so", async () => {
    expect(setUp().code).toBe(0);
    await enrolRoot();
    const result = run("reset-root-password", ["--yes"], {
      RONNE_ROOT_PASSWORD: "a brand new password",
    });
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain("Its two-factor sign-in was turned off too");
    expect((await state()).records).toBe(0);
  });
});
