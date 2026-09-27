import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/server/db/create-db";
import { createTestDb, type TestDb } from "../src/server/db/testing/test-db";

// Runs the real `pnpm run setup` entry point, non-interactively, with only environment variables.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-setup-cli-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const root = {
  RONNE_ROOT_EMAIL: "root@example.com",
  RONNE_ROOT_NAME: "Root",
  RONNE_ROOT_PASSWORD: "correct horse battery",
};

function setup(args: string[], env: Record<string, string>) {
  const result = spawnSync("pnpm", ["exec", "tsx", "scripts/setup.ts", ...args], {
    cwd: new URL("..", import.meta.url),
    // CI is set explicitly: GitHub Actions sets CI=true, which changes the mode.
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
}

const sqlite = () => ({
  DATABASE_URL: `file:${join(dir, "ronne.db")}`,
  STORAGE_PATH: join(dir, "storage"),
  PUBLIC_URL: "http://localhost:3000",
});

describe("pnpm run setup --yes", () => {
  it("sets up SQLite from environment variables only, then is safe to run again", () => {
    const first = setup(["--yes"], { ...sqlite(), ...root });
    expect(first.stderr).toBe("");
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("✓ Created the root account root@example.com.");
    expect(statSync(join(dir, ".env")).mode & 0o777).toBe(0o600);
    expect(existsSync(join(dir, "storage"))).toBe(true);

    const second = setup(["--yes"], sqlite());
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("already exists");
  }, 60_000);

  it("exits with 2 and names the missing value", () => {
    const { RONNE_ROOT_EMAIL: _, ...withoutEmail } = root;
    const result = setup(["--yes"], { ...sqlite(), ...withoutEmail });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("RONNE_ROOT_EMAIL");
  }, 60_000);

  it("exits with 2 on a password that's too short", () => {
    const result = setup(["--yes"], { ...sqlite(), ...root, RONNE_ROOT_PASSWORD: "short" });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("at least 12");
  }, 60_000);

  it("exits with 1 when the database check fails, and writes no .env", () => {
    const result = setup(["--yes"], {
      ...sqlite(),
      ...root,
      DATABASE_URL: "postgres://ronne:secret@127.0.0.1:1/ronne",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Couldn't reach the database server");
    expect(existsSync(join(dir, ".env"))).toBe(false);
  }, 60_000);

  it("refuses to run without a terminal unless --yes is given, and runs on CI without it", () => {
    const refused = setup([], { ...sqlite(), ...root });
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("--yes");

    expect(setup([], { ...sqlite(), ...root, CI: "true" }).code).toBe(0);
  }, 60_000);
});

// Smoke test for 004's matrix: setup against an empty MySQL/MariaDB or PostgreSQL database.
const serverUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!serverUrl || serverUrl.startsWith("file:"))(
  "pnpm run setup --yes against a server",
  () => {
    let t: TestDb;
    beforeEach(async () => {
      t = await createTestDb({ migrate: false });
    });
    afterEach(() => t.cleanup());

    it("migrates and creates root", async () => {
      const result = setup(["--yes"], {
        DATABASE_URL: t.url,
        STORAGE_PATH: join(dir, "storage"),
        PUBLIC_URL: "http://localhost:3000",
        ...root,
      });
      expect(result.code, result.stderr).toBe(0);

      const { db } = createDb(t.url);
      expect(await db.selectFrom("user").select(["email", "role"]).execute()).toEqual([
        { email: "root@example.com", role: "root" },
      ]);
      await db.destroy();
    }, 60_000);
  },
);
