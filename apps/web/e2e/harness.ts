import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const appDir = resolve(import.meta.dirname, "..");

/** A free TCP port, found by a child process (the config is loaded synchronously). */
function freePort(): number {
  const script =
    "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
  return Number(execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }).trim());
}

/**
 * Creates a throwaway instance for one test run: SQLite in a temporary folder, configured by
 * `pnpm run setup --yes`, plus the test users. Returns the environment for `next start`.
 *
 * Every setting is passed as an environment variable, which takes precedence over files: Next.js
 * loads apps/web/.env on its own, and a developer's local instance must never be used by the tests.
 */
export function prepareInstance(): { baseURL: string; env: Record<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), "ronne-e2e-"));
  const port = Number(process.env.E2E_PORT) || freePort();
  const baseURL = `http://localhost:${port}`;
  const envFile = join(dir, ".env");
  const base = {
    RONNE_ENV_FILE: envFile,
    DATABASE_URL: `file:${join(dir, "ronne.db")}`,
    STORAGE_PATH: join(dir, "storage"),
    PUBLIC_URL: baseURL,
  };
  const run = (args: string[], extra: Record<string, string> = {}) =>
    execFileSync("pnpm", ["exec", "tsx", ...args], {
      cwd: appDir,
      env: { ...process.env, ...base, ...extra },
      stdio: ["ignore", "ignore", "inherit"],
    });

  run(["scripts/setup.ts", "--yes"], {
    RONNE_ROOT_EMAIL: E2E_USERS.root,
    RONNE_ROOT_NAME: "Root",
    RONNE_ROOT_PASSWORD: E2E_PASSWORD,
  });
  run(["e2e/seed.ts"]);

  const written = parseEnv(readFileSync(envFile, "utf8"));
  return {
    baseURL,
    env: {
      ...base,
      AUTH_SECRET: written.AUTH_SECRET ?? "",
      TRUST_PROXY: "false",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  };
}
