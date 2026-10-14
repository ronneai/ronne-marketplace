import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real `pnpm run setup`, `backup` and `restore` entry points (099), as rmk-server runs
// them (RONNE_RUNTIME=npm, each instance's data folder in RONNE_DATA_DIR), on SQLite files.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-restore-cli-"));
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

describe("pnpm run restore (099)", () => {
  it("restores into a new data folder, refuses a second time (1) and bad flags (2)", () => {
    const first = join(dir, "first");
    const second = join(dir, "second");
    expect(
      run("setup", ["--yes"], first, {
        DATABASE_URL: `file:${join(first, "ronne.db")}`,
        STORAGE_PATH: join(first, "storage"),
        PUBLIC_URL: "http://localhost:7650",
        RONNE_ROOT_EMAIL: "root@example.com",
        RONNE_ROOT_NAME: "Root",
        RONNE_ROOT_PASSWORD: "correct horse battery",
      }).code,
    ).toBe(0);
    expect(run("backup", [], first).code).toBe(0);
    const [name] = readdirSync(join(first, "backups"));
    const archive = join(first, "backups", name as string);

    // --with-settings alone would restore into the backup's own DATABASE_URL: the first
    // instance's file, which isn't empty and is refused (below).
    const into = run("restore", [archive, "--with-settings"], second);
    expect(into.code).toBe(1);
    expect(into.stderr).toContain("isn't empty");
    const restored = run(
      "restore",
      [archive, "--with-settings", "--database-url", `file:${join(second, "ronne.db")}`],
      second,
    );
    expect(restored.code, restored.stderr).toBe(0);
    expect(restored.stdout).toContain("Restored ");
    expect(restored.stdout).toContain("Next, start the server: rmk-server.");
    expect(existsSync(join(second, "ronne.db"))).toBe(true);
    expect(existsSync(join(second, ".env"))).toBe(true);

    const again = run("restore", [archive], second);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("isn't empty");
    expect(again.stderr).toContain("Nothing was changed");

    const bad = run("restore", [], second);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("Name one archive to restore.");
  });
});
