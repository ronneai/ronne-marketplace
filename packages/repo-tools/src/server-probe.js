#!/usr/bin/env node
// Usage: node packages/repo-tools/src/server-probe.js [rmk-server command]   (default: rmk-server)
// Runs an installed rmk-server (feature 082) as a person would, on any system: starts it with an
// empty data folder, waits for /api/health = 503 setup_required, runs `rmk-server setup --yes` with
// SQLite, expects 200 with no restart and a token from sign-in, then stops it and checks the port is
// free. Used by the server-package workflow on Ubuntu, macOS and Windows.
import { execFileSync, execSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const command = process.argv[2] ?? "rmk-server";
const windows = process.platform === "win32";
const work = mkdtempSync(join(tmpdir(), "rmk-server-probe-"));
const dataDir = join(work, "data");
const options = (env) => ({ env: { ...process.env, ...env, RONNE_DATA_DIR: dataDir } });
// npm installs a .cmd on Windows, which only a shell can start. The shell gets one command line:
// passing arguments separately with `shell: true` is deprecated (DEP0190).
const line = (args) => [`"${command}"`, ...args].join(" ");
const runSync = (args, opts) =>
  windows ? execSync(line(args), opts) : execFileSync(command, args, opts);
const start = (args, opts) =>
  windows ? spawn(line(args), { ...opts, shell: true }) : spawn(command, args, opts);

const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const portFree = (port) =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stops the server and everything it started: on Windows the shell's whole tree. */
const stop = (child) => {
  if (windows) {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // already gone
    }
  } else child.kill("SIGTERM");
};

const step = (message) => console.log(`✓ ${message}`);

let server;
try {
  const version = runSync(["--version"], { ...options({}), encoding: "utf8" }).trim();
  step(
    `${command} --version: ${version} (Node ${process.versions.node}, ${process.platform} ${process.arch})`,
  );

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let log = "";
  server = start(["--port", String(port), "--no-open"], options({}));
  server.stdout.on("data", (chunk) => (log += chunk));
  server.stderr.on("data", (chunk) => (log += chunk));
  // A server that exits (a crash, a wrong command) fails the probe at once, not after the wait.
  let exited;
  server.on("exit", (code) => (exited = code ?? "a signal"));

  let health;
  for (let i = 0; i < 90 && !health; i++) {
    if (exited !== undefined)
      throw new Error(`${command} exited (${exited}) before answering. Log:\n${log}`);
    try {
      const response = await fetch(`${url}/api/health`);
      health = { status: response.status, body: await response.json() };
    } catch {
      await sleep(1000);
    }
  }
  if (!health) throw new Error(`no answer on ${url} within 90 seconds. Log:\n${log}`);
  if (health.status !== 503 || health.body?.error?.code !== "setup_required")
    throw new Error(`before setup it answered ${health.status} ${JSON.stringify(health.body)}`);
  if (!health.body.error.message.includes("rmk-server setup"))
    throw new Error(`the 503 doesn't name rmk-server setup: ${health.body.error.message}`);
  step(`started on ${url}; /api/health 503 setup_required, naming rmk-server setup`);

  const password = "Correct-horse-42!";
  const databaseFile = join(dataDir, "ronne.db").replaceAll("\\", "/");
  runSync(["setup", "--yes"], {
    ...options({
      PORT: String(port),
      DATABASE_URL: `file:${databaseFile}`,
      RONNE_ROOT_EMAIL: "root@example.com",
      RONNE_ROOT_NAME: "Root",
      RONNE_ROOT_PASSWORD: password,
    }),
    stdio: "inherit",
  });
  const files = readdirSync(dataDir).sort();
  for (const expected of [".env", "ronne.db", "storage"])
    if (!files.includes(expected))
      throw new Error(`the data folder has ${files.join(", ")}, not ${expected}`);
  step(`setup --yes wrote ${files.join(", ")} in the data folder`);

  const after = await fetch(`${url}/api/health`);
  if (after.status !== 200) throw new Error(`after setup it answered ${after.status}, not 200`);
  step("/api/health 200 after setup, with no restart");

  const token = await fetch(`${url}/api/v1/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "root@example.com", password, name: "probe" }),
  });
  const body = await token.json();
  if (token.status !== 201 || !String(body.token).startsWith("rmk_"))
    throw new Error(`sign-in answered ${token.status} ${JSON.stringify(body)}`);
  step("sign-in returned an access token");

  stop(server);
  server = undefined;
  let free = false;
  for (let i = 0; i < 20 && !free; i++) {
    free = await portFree(port);
    if (!free) await sleep(500);
  }
  if (!free) throw new Error(`port ${port} is still in use after stopping rmk-server`);
  step("stopping rmk-server freed the port");
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) stop(server);
  await sleep(500);
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
