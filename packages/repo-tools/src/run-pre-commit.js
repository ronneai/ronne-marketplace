#!/usr/bin/env node
// Runs the checks a commit needs (see pre-commit.js). Called by .githooks/pre-commit.
// The checks run on the working tree, so unstaged changes are checked too.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { planChecks } from "./pre-commit.js";

const staged = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

// The witness records are documentation, so this check runs even when the others are skipped.
const witness = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("./check-witness.js", import.meta.url))],
  {
    stdio: "inherit",
  },
);
if (witness.status !== 0) {
  console.error("\n✗ pre-commit: the witness check failed, so the commit was stopped.");
  process.exit(1);
}

const commands = planChecks(staged);
if (commands.length === 0) {
  console.log("pre-commit: documentation only, skipping checks.");
  process.exit(0);
}

const unstaged = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).trim();
if (unstaged) {
  console.warn(
    "pre-commit: note that unstaged changes are in the working tree and get checked too.",
  );
}

for (const command of commands) {
  const label = command.join(" ");
  console.log(`\npre-commit: ${label}`);
  const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(
      `\n✗ pre-commit: "${label}" failed, so the commit was stopped. Fix it and commit again.`,
    );
    process.exit(1);
  }
}
console.log("\n✓ pre-commit: all checks passed.");
