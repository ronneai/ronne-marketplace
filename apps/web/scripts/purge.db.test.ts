import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/server/db/create-db";
import { newId } from "../src/server/db/ids";

// Runs the real `pnpm run setup` and `purge` entry points (102) on a SQLite file.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-purge-cli-"));
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

/** An audit event with an IP, a year old: past any retention. */
const seedOldEvent = async () => {
  const { db } = createDb(databaseUrl());
  try {
    const id = newId();
    await db
      .insertInto("audit_log")
      .values({
        id,
        actor_id: null,
        action: "auth.signed_in",
        target_type: "none",
        target_id: null,
        metadata: "{}",
        ip_address: "203.0.113.7",
        created_at: "2025-10-18T12:00:00.000Z",
      })
      .execute();
    return id;
  } finally {
    await db.destroy();
  }
};

const ipOf = async (id: string) => {
  const { db } = createDb(databaseUrl());
  try {
    const row = await db
      .selectFrom("audit_log")
      .select("ip_address")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    return row.ip_address;
  } finally {
    await db.destroy();
  }
};

describe("pnpm run purge (102)", () => {
  it("counts in a dry run and changes nothing, then purges and prints the counts", async () => {
    expect(setUp().code).toBe(0);
    const id = await seedOldEvent();
    const dry = run("purge", ["--dry-run"]);
    expect(dry.code, dry.stderr).toBe(0);
    expect(dry.stdout).toContain(
      "IP addresses cleared: 1 (audit log 1, sessions 0, device grants 0)",
    );
    expect(dry.stdout).toContain("Failed sign-ins' emails cleared: 0");
    expect(dry.stdout).toContain("Expired sessions deleted: 0");
    expect(dry.stdout).toContain("Finished device grants deleted: 0");
    expect(dry.stdout).toContain("A dry run: nothing was changed.");
    expect(await ipOf(id)).toBe("203.0.113.7");

    const real = run("purge", []);
    expect(real.code, real.stderr).toBe(0);
    expect(real.stdout).toContain("IP addresses cleared: 1 (audit log 1");
    expect(real.stdout).not.toContain("dry run");
    expect(await ipOf(id)).toBeNull();

    // Idempotent, and the row holds the run.
    const again = run("purge", []);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("IP addresses cleared: 0");
    const { db } = createDb(databaseUrl());
    try {
      const job = await db
        .selectFrom("jobs")
        .select(["lease_holder", "last_result"])
        .where("name", "=", "retention_purge")
        .executeTakeFirstOrThrow();
      expect(job.lease_holder).toBeNull();
      expect(JSON.parse(job.last_result ?? "{}")).toMatchObject({
        status: "ok",
        counts: { ipsCleared: 0 },
      });
    } finally {
      await db.destroy();
    }
  });

  it("refuses with exit 1 while another run holds the lease, and a dry run needs no lease", async () => {
    expect(setUp().code).toBe(0);
    const { db } = createDb(databaseUrl());
    try {
      await db
        .insertInto("jobs")
        .values({
          name: "retention_purge",
          lease_holder: "the-scheduler",
          lease_ends_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          last_run_at: null,
          last_result: null,
        })
        .execute();
    } finally {
      await db.destroy();
    }
    const held = run("purge", []);
    expect(held.code).toBe(1);
    expect(held.stderr).toContain("Another purge is running");
    const dry = run("purge", ["--dry-run"]);
    expect(dry.code, dry.stderr).toBe(0);
  });

  it("needs the instance set up (exit 2), and shows its usage", () => {
    const notSetUp = run("purge", []);
    expect(notSetUp.code).toBe(2);
    expect(notSetUp.stderr).toContain("DATABASE_URL");
    const help = run("purge", ["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("Usage: purge [--dry-run]");
    const bad = run("purge", ["--bogus"]);
    expect(bad.code).toBe(2);
  });
});
