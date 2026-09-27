import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// pnpm db:migrate reads DATABASE_URL from the settings file RONNE_ENV_FILE points to.
const dir = mkdtempSync(join(tmpdir(), "ronne-migrate-env-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("pnpm db:migrate with RONNE_ENV_FILE", () => {
  it("migrates the database named in that file", () => {
    const envFile = join(dir, "settings.env");
    writeFileSync(envFile, `DATABASE_URL=file:${join(dir, "from-file.db")}\n`);
    const output = execFileSync("pnpm", ["exec", "tsx", "scripts/migrate.ts"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, DATABASE_URL: "", RONNE_ENV_FILE: envFile },
      encoding: "utf8",
    });
    expect(output).toContain("from-file.db");
    expect(output).toContain("applied 0001_identity");
  }, 60_000);
});
