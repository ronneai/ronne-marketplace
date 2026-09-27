#!/usr/bin/env node
// Reads changed file paths (one per line) on stdin and prints "false" when every one is
// documentation, "true" otherwise: whether a pull request needs the full CI checks. It uses the same
// rule as the pre-commit hook (pre-commit.js). An empty list prints "true", so detection never skips
// checks by accident.
import { readFileSync } from "node:fs";
import { isDocumentation } from "./pre-commit.js";

/** @param {string[]} files */
export function needsChecks(files) {
  return files.length === 0 || !files.every(isDocumentation);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = readFileSync(0, "utf8")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  process.stdout.write(String(needsChecks(files)));
}
