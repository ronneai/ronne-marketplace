#!/usr/bin/env node
// Usage: pnpm release:smoke   (after pnpm build)
// Packs core, rmk and the MCP server as they'd be published, installs the tarballs with npm into an
// empty folder, as a user would, then runs rmk and completes an MCP initialize with rmk-mcp
// (feature 034). Needs the network, for the packages' own dependencies.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
} catch (error) {
  console.error(`✗ ${error.stderr ?? error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
