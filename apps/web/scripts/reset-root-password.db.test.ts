import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/server/db/create-db";
import { createAuth } from "../src/server/domains/identity/repositories/better-auth";

// Runs the real `pnpm run setup` and `pnpm run reset-root-password` entry points.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-reset-cli-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(script: string, args: string[], env: Record<string, string>) {
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
}

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

async function signIn(password: string) {
  const { db, dialect } = createDb(databaseUrl());
  const auth = createAuth({
    db,
    dialect,
    secret: "test-secret-test-secret-test-secret-00",
    baseURL: "http://localhost:3000",
  });
  try {
    await auth.api.signInEmail({ body: { email: "root@example.com", password } });
    return true;
  } catch {
    return false;
  } finally {
    await db.destroy();
  }
}

describe("pnpm run reset-root-password --yes", () => {
  it("sets the new password (from .env's DATABASE_URL) and the old one stops working", async () => {
    expect(setUp().code).toBe(0);

    const result = run("reset-root-password", ["--yes"], {
      RONNE_ROOT_PASSWORD: "a brand new passphrase",
    });
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Reset the password for root@example.com");

    expect(await signIn("correct horse battery")).toBe(false);
    expect(await signIn("a brand new passphrase")).toBe(true);
  }, 60_000);

  it("exits with 1 and says so when there's no root yet", () => {
    expect(run("migrate", [], { DATABASE_URL: databaseUrl() }).code).toBe(0);
    const result = run("reset-root-password", ["--yes"], {
      DATABASE_URL: databaseUrl(),
      RONNE_ROOT_PASSWORD: "a brand new passphrase",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("There's no root account yet");
  }, 60_000);

  it("exits with 2 for a missing or too-short password, or no database", () => {
    expect(setUp().code).toBe(0);
    expect(run("reset-root-password", ["--yes"], {}).code).toBe(2);
    expect(run("reset-root-password", ["--yes"], { RONNE_ROOT_PASSWORD: "short" }).code).toBe(2);
    expect(
      run("reset-root-password", ["--yes"], {
        RONNE_ENV_FILE: join(dir, "none.env"),
        RONNE_ROOT_PASSWORD: "a brand new passphrase",
      }).code,
    ).toBe(2);
  }, 90_000);

  it("refuses to wait for a password without a terminal", () => {
    const result = run("reset-root-password", [], {
      RONNE_ROOT_PASSWORD: "a brand new passphrase",
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--yes");
  }, 60_000);
});
