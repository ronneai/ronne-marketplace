#!/usr/bin/env node
// Usage: node packages/repo-tools/src/check-packs.js (after `pnpm build` and `pnpm build:server`:
// packing the server runs its assembler, which needs the web app's standalone build, 082)
// Packs each published package without writing it (`pnpm pack --dry-run`) and checks its files
// against the allowlist in packs.js. Exits with 1 on any problem (feature 034).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkPack, PUBLISHED } from "./packs.js";

const packages = fileURLToPath(new URL("../../", import.meta.url));
const license = readFileSync(new URL("../../../LICENSE", import.meta.url), "utf8");
let failed = false;
for (const folder of Object.keys(PUBLISHED)) {
  let output;
  try {
    output = execFileSync("pnpm", ["pack", "--dry-run", "--json"], {
      cwd: `${packages}${folder}`,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    failed = true;
    console.error(
      `✗ ${PUBLISHED[folder].name} doesn't pack:\n${error.stderr || error.stdout || error.message}`,
    );
    continue;
  }
  // pnpm prints the prepack script's output first; the JSON report is the last object.
  const pack = JSON.parse(output.slice(output.indexOf("{\n")));
  const problems = checkPack(folder, pack);
  // Each package ships a copy of the repository's LICENSE; they must stay the same.
  if (readFileSync(`${packages}${folder}/LICENSE`, "utf8") !== license)
    problems.push("has a LICENSE that differs from the repository's: copy it again");
  if (problems.length) {
    failed = true;
    console.error(`✗ ${pack.name}:`);
    for (const problem of problems) console.error(`  - ${problem}`);
  } else console.log(`✓ ${pack.name}: ${pack.files.length} files, all on the allowlist.`);
}
if (failed) process.exitCode = 1;
