#!/usr/bin/env node
// Usage:
//   check-commit-message --file <path>   the commit-msg git hook passes the message file
//   check-commit-message "<title>"       CI passes the pull request title
//   --no-length                          skip the length rule (CI uses it for Dependabot only)
import { readFileSync } from "node:fs";
import { checkSubject } from "./commit-message.js";

const noLength = process.argv.includes("--no-length");
const args = process.argv.slice(2).filter((arg) => arg !== "--no-length");
const message =
  args[0] === "--file" && args[1]
    ? readFileSync(args[1], "utf8")
        .split("\n")
        .filter((line) => !line.startsWith("#"))
        .join("\n")
    : args.join(" ");

const result = checkSubject(message, { checkLength: !noLength });
if (!result.valid) {
  console.error(`✗ ${message.split("\n")[0]}\n`);
  for (const error of result.errors) console.error(`  - ${error}`);
  console.error(
    "\nExamples:\n  [feat] 001: Add CI workflow\n  [bugfix] #141: Try older versions\n  [docs]: Add dependency policy",
  );
  process.exitCode = 1;
}
