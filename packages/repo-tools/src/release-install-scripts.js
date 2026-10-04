#!/usr/bin/env node
// Usage: node packages/repo-tools/src/release-install-scripts.js <version> <folder>
// Writes install.sh and install.ps1 with the version written in, and checksums.txt, into the
// folder: the GitHub release's assets (feature 081).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checksums, INSTALL_SCRIPTS, withInstallVersion } from "./install-scripts.js";

const [version = "", folder = ""] = process.argv.slice(2);
try {
  if (!folder) throw new Error("Usage: release-install-scripts.js <version> <folder>");
  mkdirSync(folder, { recursive: true });
  const out = {};
  for (const [name, path] of Object.entries(INSTALL_SCRIPTS)) {
    const text = readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
    out[name] = withInstallVersion(name, text, version);
    writeFileSync(join(folder, name), out[name], { mode: 0o755 });
  }
  const sums = checksums(out);
  writeFileSync(join(folder, "checksums.txt"), sums);
  process.stdout.write(sums);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
