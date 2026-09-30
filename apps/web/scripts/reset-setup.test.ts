import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Runs the real `pnpm run reset-setup` entry point against a settings file in a temporary folder,
// with a database outside the app folder, so the developer's own clone is never touched.
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ronne-reset-cli-"));
  writeFileSync(join(dir, ".env"), `DATABASE_URL=file:${join(dir, "ronne.db")}\nAUTH_SECRET=x\n`);
  writeFileSync(join(dir, "ronne.db"), "");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const reset = (args: string[], env: Record<string, string> = {}) => {
  const result = spawnSync("pnpm", ["exec", "tsx", "scripts/reset-setup.ts", ...args], {
    cwd: new URL("..", import.meta.url),
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
      RONNE_ENV_FILE: join(dir, ".env"),
      STORAGE_PATH: join(dir, "storage"),
      ...env,
    },
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe("pnpm run reset-setup", () => {
  it("removes the settings file with --yes, and leaves a database outside the app folder", () => {
    const result = reset(["--yes"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Removed ${join(dir, ".env")}`);
    expect(result.stdout).toContain("outside the app folder");
    expect(existsSync(join(dir, ".env"))).toBe(false);
    expect(existsSync(join(dir, "ronne.db"))).toBe(true);
  });

  it("refuses in production and in Docker, and removes nothing", () => {
    const refusing: Record<string, string>[] = [
      { NODE_ENV: "production" },
      { RONNE_RUNTIME: "docker" },
    ];
    for (const env of refusing) {
      const result = reset(["--yes"], env);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("only runs");
      expect(existsSync(join(dir, ".env"))).toBe(true);
    }
  });

  it("needs a terminal or --yes", () => {
    const result = reset([]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--yes");
    expect(existsSync(join(dir, ".env"))).toBe(true);
  });
});
