#!/usr/bin/env node
// Checks the state witness records (see witness.js). Run by the pre-commit hook, even for
// documentation-only commits, and by CI.
import { execFileSync } from "node:child_process";
import { checkAll } from "./witness.js";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const errors = checkAll(root);
if (errors.length > 0) {
  console.error("✗ witness: the records don't hold (docs/knowledge/state-witness.md)\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}
