// `rmk-server start` and the setup code (161), through the real main(): on a first start, once the
// server answers, it prints the code the server made in the data folder and opens the setup page
// with it filled in (unless --no-open); an instance that's set up gets neither.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawned = vi.hoisted(() => [] as [string, string[]][]);
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: (command: string, args: string[]) => {
    spawned.push([command, args]);
    const child = { on: () => child, unref: () => {} };
    return child;
  },
}));
// The web app's start script is never imported, whether or not the package was assembled here.
vi.mock("node:url", async (original) => ({
  ...(await original<typeof import("node:url")>()),
  pathToFileURL: () => new URL("file:///rmk-server-test/not-there.mjs"),
}));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  // The web app isn't assembled into the package in a test run.
  const stubbed = {
    ...fs,
    existsSync: (path: string) => String(path).endsWith("dist-scripts") || fs.existsSync(path),
  };
  return { ...stubbed, default: stubbed };
});

const { main } = await import("./run.js");

const CODE = "1KQ2M-ABCDE-FGHJK-MNPQR-STVWX-0";
const platform = process.platform;
const env = { ...process.env };
const isTTY = process.stdout.isTTY;
let printed: string[];
let dir: string;

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

beforeEach(() => {
  // macOS opens a browser with `open URL`, the same on any machine running the test.
  Object.defineProperty(process, "platform", { value: "darwin" });
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  dir = mkdtempSync(join(tmpdir(), "rmk-start-code-"));
  for (const name of ["RONNE_ENV_FILE", "PORT", "HOST"]) delete process.env[name];
  process.env.RONNE_DATA_DIR = dir;
  printed = [];
  spawned.length = 0;
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    printed.push(String(chunk));
    return true;
  });
  vi.stubGlobal("fetch", async () => ({ ok: true }));
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: platform });
  Object.defineProperty(process.stdout, "isTTY", { value: isTTY, configurable: true });
  process.env = { ...env };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe("rmk-server start and the setup code (161)", () => {
  it("prints the code once the server answers, and opens the page with it filled in", async () => {
    writeFileSync(join(dir, "setup-code"), "1KQ2MABCDEFGHJKMNPQRSTVWX0\n");
    const port = await freePort();
    await expect(main(["--port", String(port)])).rejects.toThrow(/not-there\.mjs/);
    await vi.waitFor(() => expect(spawned).toHaveLength(1), { timeout: 3000 });
    expect(printed.join("")).toContain(`Setup code: ${CODE}`);
    expect(printed.join("")).toContain(`Open http://localhost:${port}/setup and enter it.`);
    expect(spawned).toEqual([["open", [`http://localhost:${port}/setup#code=${CODE}`]]]);
  });

  it("with --no-open, prints it and opens nothing", async () => {
    writeFileSync(join(dir, "setup-code"), "1KQ2MABCDEFGHJKMNPQRSTVWX0\n");
    const port = await freePort();
    await expect(main(["--port", String(port), "--no-open"])).rejects.toThrow(/not-there\.mjs/);
    await vi.waitFor(() => expect(printed.join("")).toContain(`Setup code: ${CODE}`), {
      timeout: 3000,
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(spawned).toEqual([]);
  });

  it("says nothing of a code once the instance is set up", async () => {
    writeFileSync(join(dir, ".env"), "AUTH_SECRET=x\nDATABASE_URL=file:x\n");
    writeFileSync(join(dir, "setup-code"), "1KQ2MABCDEFGHJKMNPQRSTVWX0\n");
    const port = await freePort();
    await expect(main(["--port", String(port)])).rejects.toThrow(/not-there\.mjs/);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(printed.join("")).not.toContain("Setup code");
    expect(spawned).toEqual([]);
  });
});
