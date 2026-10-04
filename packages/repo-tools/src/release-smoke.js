#!/usr/bin/env node
// Usage: pnpm release:smoke   (after pnpm build and pnpm build:server)
// Packs core, rmk, the MCP server and the server as they'd be published, installs the tarballs with
// npm into an empty folder, as a user would, then runs rmk, completes an MCP initialize with
// rmk-mcp (feature 034), and starts rmk-server until it answers in setup mode (082). Needs the
// network, for the packages' own dependencies.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { PUBLISHED } from "./packs.js";

const packages = fileURLToPath(new URL("../../", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "rmk-smoke-"));
const tarballs = join(work, "tarballs");
const app = join(work, "app");

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const initialize = (bin) =>
  new Promise((resolve, reject) => {
    const server = spawn(bin, [], { cwd: app, env: { ...process.env, HOME: work } });
    const timer = setTimeout(() => {
      server.kill();
      reject(new Error("rmk-mcp didn't answer initialize within 20 seconds."));
    }, 20_000);
    createInterface({ input: server.stdout }).on("line", (line) => {
      const reply = JSON.parse(line);
      if (reply.id !== 1) return;
      clearTimeout(timer);
      server.kill();
      resolve(reply.result);
    });
    server.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "smoke", version: "0" },
        },
      })}\n`,
    );
  });

/** A port nothing listens on, from the system. */
const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/** Starts rmk-server with an empty data folder and waits for /api/health; stops it after. */
const serverAnswers = async (bin) => {
  const port = await freePort();
  const server = spawn(bin, ["--port", String(port), "--no-open"], {
    cwd: app,
    env: { ...process.env, HOME: work, RONNE_DATA_DIR: join(work, "server-data") },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        return { status: response.status, body: await response.json() };
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error("rmk-server didn't answer /api/health within 60 seconds.");
  } finally {
    server.kill();
  }
};

try {
  for (const folder of Object.keys(PUBLISHED))
    run("pnpm", ["pack", "--pack-destination", tarballs], `${packages}${folder}`);
  const files = readdirSync(tarballs).map((file) => join(tarballs, file));
  console.log(`Packed ${files.length}: ${readdirSync(tarballs).join(", ")}`);
  run("mkdir", ["-p", app]);
  writeFileSync(join(app, "package.json"), '{ "name": "smoke", "private": true }\n');
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...files], app);
  // pnpm turns workspace:^ into a real range when it packs; a leftover wouldn't install for anyone.
  for (const { name } of Object.values(PUBLISHED)) {
    const installed = readFileSync(join(app, "node_modules", name, "package.json"), "utf8");
    if (installed.includes('"workspace:'))
      throw new Error(`${name} was packed with a workspace: dependency.`);
  }
  console.log("✓ every dependency is a published range, not workspace:");
  const bin = (name) => join(app, "node_modules", ".bin", name);
  const version = run(bin("rmk"), ["--version"], app).trim();
  console.log(`✓ rmk --version: ${version}`);
  if (!run(bin("rmk"), ["--help"], app).includes("mcp-setup"))
    throw new Error("rmk --help doesn't list its commands.");
  console.log("✓ rmk --help lists its commands");
  const result = await initialize(bin("rmk-mcp"));
  if (result?.serverInfo?.name !== "ronne-registry" || result.serverInfo.version !== version)
    throw new Error(`rmk-mcp answered ${JSON.stringify(result?.serverInfo)}.`);
  console.log(`✓ rmk-mcp answered initialize as ronne-registry ${version}`);
  const serverVersion = run(bin("rmk-server"), ["--version"], app).trim();
  if (serverVersion !== version)
    throw new Error(`rmk-server --version is ${serverVersion}, not ${version}.`);
  const health = await serverAnswers(bin("rmk-server"));
  if (health.status !== 503 || health.body?.error?.code !== "setup_required")
    throw new Error(`rmk-server answered ${health.status} ${JSON.stringify(health.body)}.`);
  console.log(`✓ rmk-server ${serverVersion} started and answered 503 setup_required`);
} catch (error) {
  console.error(`✗ ${error.stderr ?? error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
