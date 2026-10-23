// A start on Windows through the real main() (#222): what it prints and how it opens the browser.
// Node's own modules are stubbed where Windows paths would reach this machine's disk.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WINDOWS_NOTE } from "./platform.js";

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
  const stubbed = {
    ...fs,
    // The web app isn't assembled into the package in a test run.
    existsSync: (path: string) => String(path).endsWith("dist-scripts") || fs.existsSync(path),
    // A Windows folder would be made in this machine's current folder.
    mkdirSync: (path: string, options?: unknown) =>
      String(path).startsWith("C:\\") ? undefined : fs.mkdirSync(path, options as never),
  };
  return { ...stubbed, default: stubbed };
});

const { main } = await import("./run.js");

const platform = process.platform;
const env = { ...process.env };
const isTTY = process.stdout.isTTY;
let printed: string[];

beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  for (const name of ["RONNE_DATA_DIR", "RONNE_ENV_FILE", "PORT", "HOST"]) delete process.env[name];
  process.env.LOCALAPPDATA = "C:\\Users\\ana\\AppData\\Local";
  process.env.SystemRoot = "C:\\Windows";
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
});

describe("rmk-server start on Windows (#222)", () => {
  it("prints the data folder and the note, and opens the browser with cmd.exe by its path", async () => {
    // start.mjs isn't imported: everything before it has run.
    await expect(main(["--port", "47123"])).rejects.toThrow(/not-there\.mjs/);
    expect(printed.join("")).toBe(
      `Data folder: C:\\Users\\ana\\AppData\\Local\\RonneAI\\Marketplace\n${WINDOWS_NOTE}\n`,
    );
    // The browser opens once the server answers, half a second on.
    await vi.waitFor(() => expect(spawned.length).toBe(1), { timeout: 3000 });
    expect(spawned).toEqual([
      ["C:\\Windows\\System32\\cmd.exe", ["/c", "start", "", "http://localhost:47123"]],
    ]);
  });
});
