import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ensureSetupCode, formatSetupCode, readSetupCode } from "./setup-code";
import { runSetupCode, setupCodeLines } from "./setup-code-command";

const dir = mkdtempSync(join(tmpdir(), "ronne-setup-code-command-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let runs = 0;
/** A clone's app folder, not set up: its code goes in `<app>/data/setup-code`. */
const freshApp = () => {
  const appDir = join(dir, `app-${runs++}`);
  mkdirSync(appDir);
  return { appDir, env: { RONNE_ENV_FILE: join(appDir, ".env"), PORT: "7650" } };
};

describe("setup-code (161)", () => {
  it("prints the code there is, with the address to open", async () => {
    const { appDir, env } = freshApp();
    const { code } = ensureSetupCode(join(appDir, "data", "setup-code"));
    const answer = await runSetupCode({ appDir, env });
    expect(answer).toEqual({ kind: "code", code, created: false, url: "http://localhost:7650" });
    if (answer.kind !== "code") throw new Error("no code");
    expect(setupCodeLines(answer)).toEqual([
      `Setup code: ${formatSetupCode(code)}`,
      "Open http://localhost:7650/setup and enter it.",
    ]);
  });

  it("makes one when there's none, 0600, where the server reads it", async () => {
    const { appDir, env } = freshApp();
    const answer = await runSetupCode({ appDir, env });
    expect(answer).toMatchObject({ kind: "code", created: true });
    const path = join(appDir, "data", "setup-code");
    expect(readSetupCode(path)).toBe((answer as { code: string }).code);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("replaces a file that holds no code (a start only reports it)", async () => {
    const { appDir, env } = freshApp();
    const path = join(appDir, "data", "setup-code");
    mkdirSync(join(appDir, "data"));
    writeFileSync(path, "");
    const answer = await runSetupCode({ appDir, env });
    expect(answer).toMatchObject({ kind: "code", created: true });
    expect(readSetupCode(path)).toBe((answer as { code: string }).code);
  });

  it("uses the npm package's data folder and PUBLIC_URL", async () => {
    const { appDir } = freshApp();
    const data = join(appDir, "elsewhere");
    const answer = await runSetupCode({
      appDir,
      env: {
        RONNE_RUNTIME: "npm",
        RONNE_DATA_DIR: data,
        RONNE_ENV_FILE: join(data, ".env"),
        PUBLIC_URL: "https://ronne.example.com/",
      },
    });
    expect(readSetupCode(join(data, "setup-code"))).toBe((answer as { code: string }).code);
    expect(setupCodeLines(answer as Extract<typeof answer, { kind: "code" }>)[1]).toBe(
      "Open https://ronne.example.com/setup and enter it.",
    );
  });

  it("gives a code while setup is incomplete or the database doesn't answer", async () => {
    for (const state of ["incomplete", "unavailable"] as const) {
      const { appDir, env } = freshApp();
      expect(await runSetupCode({ appDir, env, getState: async () => state })).toMatchObject({
        kind: "code",
      });
    }
  });

  it("refuses once the instance is set up, and makes nothing", async () => {
    const { appDir, env } = freshApp();
    const answer = await runSetupCode({ appDir, env, getState: async () => "ready" });
    expect(answer).toEqual({
      kind: "set-up",
      message: expect.stringContaining("already set up, so there's no setup code"),
    });
    expect(readSetupCode(join(appDir, "data", "setup-code"))).toBeNull();
    // As Docker's terminal types the recovery command.
    expect(
      await runSetupCode({
        appDir,
        env: { ...env, RONNE_RUNTIME: "docker" },
        getState: async () => "ready",
      }),
    ).toMatchObject({
      message: expect.stringContaining("docker compose exec web pnpm run reset-root-password"),
    });
  });

  it("runs as a script: prints the code and exits 0", () => {
    const { appDir } = freshApp();
    const tsx = new URL("../../../node_modules/.bin/tsx", import.meta.url).pathname;
    const script = new URL("../../../scripts/setup-code.ts", import.meta.url).pathname;
    // The script finds its app folder from its own place; the data folder comes from the npm
    // runtime's RONNE_DATA_DIR, so it writes in this test's folder.
    const data = join(appDir, "data");
    const run = spawnSync(tsx, [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        RONNE_RUNTIME: "npm",
        RONNE_DATA_DIR: data,
        RONNE_ENV_FILE: join(data, ".env"),
        DATABASE_URL: "",
        AUTH_SECRET: "",
        PORT: "7650",
      },
    });
    expect(run.status, run.stderr).toBe(0);
    const code = readFileSync(join(data, "setup-code"), "utf8").trim();
    expect(run.stdout).toBe(
      `Setup code: ${formatSetupCode(code)}\nOpen http://localhost:7650/setup and enter it.\n`,
    );
  });
});
