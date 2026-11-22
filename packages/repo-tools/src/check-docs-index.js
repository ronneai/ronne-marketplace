#!/usr/bin/env node
// Checks the contributor documentation's lists and links (see docs-index.js). Run by the pre-commit hook,
// even for documentation-only commits, and by CI.
import { execFileSync } from "node:child_process";
import { checkAll } from "./docs-index.js";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const errors = checkAll(root);
if (errors.length > 0) {
  console.error("✗ docs: a list in the contributor documentation isn't complete\n");
  for (const error of errors) console.error(`  - ${error}`);
  process.exitCode = 1;
}
