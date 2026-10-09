import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_FALLBACK_ITEMS, E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

const BIN = fileURLToPath(new URL("../../../packages/cli/dist/bin.js", import.meta.url));
const baseURL: string = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main.baseURL;

/**
 * Issue #141 with `rmk` against the running instance: fallback-a's latest, 1.1.0, needs
 * fallback-b ^1.0.0, whose newest version pins fallback-a to 1.0.0. The install falls back to
 * fallback-b 1.1.0, and an update keeps it.
 */
test("rmk installs an item whose newest dependency conflicts, with an older one that fits (#141)", async ({
  request,
}) => {
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-home-"));
  const project = mkdtempSync(join(tmpdir(), "rmk-e2e-project-"));
  mkdirSync(join(project, ".claude"));
  const token = await request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.versionFallback, password: E2E_PASSWORD, name: "e2e fallback" },
  });
  expect(token.status()).toBe(201);
  const env = {
    ...process.env,
    HOME: home,
    RMK_TOKEN: (await token.json()).token,
    RMK_REGISTRY: baseURL,
  };
  const rmk = (...args: string[]) => {
    try {
      return {
        code: 0,
        out: execFileSync("node", [BIN, ...args], {
          cwd: project,
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string; stderr: string };
      return { code: failed.status, out: `${failed.stdout}${failed.stderr}` };
    }
  };
  const a = `@${E2E_SCOPE}/${E2E_FALLBACK_ITEMS.a}`;
  const b = `@${E2E_SCOPE}/${E2E_FALLBACK_ITEMS.b}`;
  const locked = () =>
    JSON.parse(readFileSync(join(project, "rmk.lock"), "utf8")).items as Record<
      string,
      { version: string }
    >;

  try {
    const install = rmk("install", a, "--target", "claude-code");
    expect(install.code, install.out).toBe(0);
    expect(locked()[a]?.version).toBe("1.1.0");
    expect(locked()[b]?.version).toBe("1.1.0");

    const update = rmk("update");
    expect(update.code, update.out).toBe(0);
    expect(locked()[a]?.version).toBe("1.1.0");
    expect(locked()[b]?.version).toBe("1.1.0");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});
