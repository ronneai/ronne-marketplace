#!/usr/bin/env node
// Usage: node packages/repo-tools/src/server-probe.js [rmk-server command]   (default: rmk-server)
// Runs an installed rmk-server (feature 082) as a person would, on any system: starts it with an
// empty data folder, waits for /api/health = 503 setup_required, runs `rmk-server setup --yes` with
// SQLite, expects 200 with no restart and a token from sign-in, then runs the incident commands
// (098): `revoke-access --everyone --yes` makes that token answer 401, and `rotate-secret --yes`
// writes a new secret the server uses at once; `backup --keep 1` (099), twice, leaves one archive,
// and on macOS `backup --out` into storage spelled in capitals is refused; then backup →
// restore into a new data folder → start: a token still works, a revoked one stays revoked, the
// account and a stored file come back the same.
// Then it stops it and checks the port is free. Used
// by the server-package workflow on Ubuntu and macOS (no Windows server since 121).
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const command = process.argv[2] ?? "rmk-server";
const work = mkdtempSync(join(tmpdir(), "rmk-server-probe-"));
const dataDir = join(work, "data");
const options = (env, dir = dataDir) => ({ env: { ...process.env, ...env, RONNE_DATA_DIR: dir } });
const runSync = (args, opts) => execFileSync(command, args, opts);
const start = (args, opts) => spawn(command, args, opts);

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

/** Stops the server. */
const stop = (child) => child.kill("SIGTERM");

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

  // Its log (feature 100): Next.js's banner as text, every line of Ronne's as JSON, and among them
  // server.started, the line to alert on, with this run's facts and no address.
  const ours = log.split("\n").filter((line) => line.startsWith("{"));
  const parsed = ours.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`a log line isn't JSON: ${line}`);
    }
  });
  const started = parsed.find((line) => line.event === "server.started");
  if (!started) throw new Error(`no server.started line. Log:\n${log}`);
  if (started.level !== "info" || started.port !== port || started.setup !== "required")
    throw new Error(`server.started says ${JSON.stringify(started)}`);
  if (!version.includes(started.version))
    throw new Error(`server.started's version ${started.version} isn't ${version}`);
  step(
    `its log is JSON (${parsed.length} lines), with server.started: ${started.runtime}, port ${started.port}`,
  );

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

  const me = () =>
    fetch(`${url}/api/v1/me`, { headers: { authorization: `Bearer ${body.token}` } });
  if ((await me()).status !== 200) throw new Error("the new token isn't accepted by /api/v1/me");
  const revoked = runSync(["revoke-access", "--everyone", "--yes"], {
    ...options({}),
    encoding: "utf8",
  });
  if (!revoked.includes("revoked 1 access token"))
    throw new Error(`revoke-access said: ${revoked}`);
  const afterRevoke = await me();
  if (afterRevoke.status !== 401)
    throw new Error(`after revoke-access the token got ${afterRevoke.status}, not 401`);
  step("revoke-access --everyone --yes: the token now gets 401");

  const secret = () => parseEnv(readFileSync(join(dataDir, ".env"), "utf8")).AUTH_SECRET;
  const before = secret();
  const rotated = runSync(["rotate-secret", "--yes"], { ...options({}), encoding: "utf8" });
  if (!rotated.includes("uses the new secret from its next request"))
    throw new Error(`rotate-secret said: ${rotated}`);
  const now = secret();
  if (!now || now === before) throw new Error("rotate-secret left AUTH_SECRET as it was");
  if ((await fetch(`${url}/api/health`)).status !== 200)
    throw new Error("after rotate-secret /api/health isn't 200");
  step("rotate-secret --yes: a new secret, used from the next request");

  // While it runs (099): one archive in the data folder's backups/.
  for (const _ of [1, 2]) {
    const made = runSync(["backup", "--keep", "1"], { ...options({}), encoding: "utf8" });
    if (!made.includes("Wrote ")) throw new Error(`backup said: ${made}`);
    // Archives are named by the second they start in.
    await sleep(1100);
  }
  const archives = readdirSync(join(dataDir, "backups"));
  if (archives.length !== 1 || !/^ronne-backup-\d{8}-\d{6}\.tar$/.test(archives[0]))
    throw new Error(`after two backups with --keep 1, backups/ holds ${archives.join(", ")}`);
  step("backup --keep 1, twice: one archive in the data folder's backups/");

  // macOS's disks ignore case: storage spelled in capitals is still storage, and the backup
  // refuses to go inside it (on Linux it's another folder). Nothing is left behind.
  if (process.platform === "darwin") {
    const inside = join(dataDir, "STORAGE", "b");
    let refused = "";
    try {
      runSync(["backup", "--out", inside], { ...options({}), encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      refused = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    if (!refused.includes("inside the storage folder"))
      throw new Error(`backup --out ${inside} wasn't refused: ${refused || "it succeeded"}`);
    if (readdirSync(join(dataDir, "storage")).includes("b"))
      throw new Error("the refused backup left its folder in storage");
    step("backup --out STORAGE/b: refused as inside storage (case-insensitive disk)");
  }

  // What a restore must bring back (099): a token that works, one revoked before the backup that
  // stays revoked, the account, and a stored file, byte for byte.
  const signIn = async (name) => {
    const response = await fetch(`${url}/api/v1/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "root@example.com", password, name }),
    });
    const json = await response.json();
    if (response.status !== 201) throw new Error(`sign-in answered ${response.status}`);
    return json.token;
  };
  const kept = await signIn("kept-through-restore");
  const dropped = await signIn("revoked-before-backup");
  const revoke = await fetch(`${url}/api/v1/auth/token`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${dropped}` },
  });
  if (!revoke.ok) throw new Error(`revoking a token answered ${revoke.status}`);
  const meWith = (base, token) =>
    fetch(`${base}/api/v1/me`, { headers: { authorization: `Bearer ${token}` } });
  const meBefore = await (await meWith(url, kept)).json();
  const stored = randomBytes(300 * 1024);
  mkdirSync(join(dataDir, "storage", "probe"), { recursive: true });
  writeFileSync(join(dataDir, "storage", "probe", "restore-check.bin"), stored);
  const backups = join(work, "restore-archive");
  runSync(["backup", "--out", backups], { ...options({}), encoding: "utf8" });
  const [archive] = readdirSync(backups);
  if (!archive) throw new Error("backup --out wrote no archive");
  step("before the restore: two tokens (one revoked), a stored file, a backup");

  stop(server);
  server = undefined;
  let free = false;
  for (let i = 0; i < 20 && !free; i++) {
    free = await portFree(port);
    if (!free) await sleep(500);
  }
  if (!free) throw new Error(`port ${port} is still in use after stopping rmk-server`);
  step("stopping rmk-server freed the port");

  // The backup restored into a new data folder, as on a new machine, then a server started on it.
  const restoredDir = join(work, "restored");
  const restored = runSync(
    [
      "restore",
      join(backups, archive),
      "--with-settings",
      "--database-url",
      `file:${join(restoredDir, "ronne.db").replaceAll("\\", "/")}`,
      "--yes",
    ],
    { ...options({}, restoredDir), encoding: "utf8" },
  );
  if (!restored.includes("Restored ")) throw new Error(`restore said: ${restored}`);
  step("restore into a new data folder");
  const port2 = await freePort();
  const url2 = `http://127.0.0.1:${port2}`;
  let log2 = "";
  server = start(["--port", String(port2), "--no-open"], options({}, restoredDir));
  server.stdout.on("data", (chunk) => (log2 += chunk));
  server.stderr.on("data", (chunk) => (log2 += chunk));
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      up = (await fetch(`${url2}/api/health`)).status === 200;
    } catch {
      // not yet
    }
    if (!up) await sleep(1000);
  }
  if (!up)
    throw new Error(`the restored instance didn't answer 200 within 90 seconds. Log:\n${log2}`);
  const meAfter = await meWith(url2, kept);
  if (meAfter.status !== 200) throw new Error(`after the restore the token got ${meAfter.status}`);
  if (JSON.stringify(await meAfter.json()) !== JSON.stringify(meBefore))
    throw new Error("after the restore /api/v1/me answers another account");
  const stillRevoked = await meWith(url2, dropped);
  if (stillRevoked.status !== 401)
    throw new Error(`the token revoked before the backup got ${stillRevoked.status}, not 401`);
  const back = readFileSync(join(restoredDir, "storage", "probe", "restore-check.bin"));
  if (!back.equals(stored)) throw new Error("the stored file came back different");
  step(
    "the restored instance: 200, the token works, the revoked one doesn't, the file is the same",
  );
  stop(server);
  server = undefined;
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) stop(server);
  await sleep(500);
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
