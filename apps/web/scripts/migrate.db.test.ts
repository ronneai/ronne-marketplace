import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Runs the real `pnpm db:migrate` entry point against a fresh SQLite file.
const dir = mkdtempSync(join(tmpdir(), "ronne-migrate-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const runMigrate = (env: Record<string, string | undefined>) =>
  execFileSync("pnpm", ["exec", "tsx", "scripts/migrate.ts"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

describe("pnpm db:migrate", () => {
  it("migrates a new SQLite file and is safe to run again", () => {
    const env = { DATABASE_URL: `file:${join(dir, "ronne.db")}` };
    expect(runMigrate(env)).toContain("✓");
    expect(runMigrate(env)).toContain("Nothing to migrate");
  }, 60_000);

  it("never prints the database password", () => {
    let output = "";
    try {
      runMigrate({ DATABASE_URL: "mongodb://ronne:hunter2@db/ronne" });
    } catch (error) {
      output = String((error as { stderr?: string }).stderr);
    }
    expect(output).toContain("***");
    expect(output).not.toContain("hunter2");
  }, 60_000);
});
