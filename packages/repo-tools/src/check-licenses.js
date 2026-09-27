#!/usr/bin/env node
// Usage: pnpm licenses list --json | node packages/repo-tools/src/check-licenses.js
// Reads the policy from license-policy.json at the repo root. Exits with 1 on any violation.
import { readFileSync } from "node:fs";
import { checkLicenses } from "./licenses.js";

const policy = JSON.parse(
  readFileSync(new URL("../../../license-policy.json", import.meta.url), "utf8"),
);

let report;
try {
  report = JSON.parse(readFileSync(0, "utf8"));
} catch (error) {
  console.error(`✗ Couldn't read the license report from stdin: ${error.message}`);
  process.exit(1);
}

const { violations, checked, unusedExceptions } = checkLicenses(report, policy);

for (const key of unusedExceptions) {
  console.warn(
    `! Exception ${key} no longer matches any installed package. Remove it from the policy.`,
  );
}

if (violations.length > 0) {
  console.error(
    `✗ ${violations.length} of ${checked} packages have a license the policy doesn't allow:\n`,
  );
  for (const v of violations) console.error(`  - ${v.name}@${v.versions.join(", ")}: ${v.license}`);
  console.error(
    "\nReplace the dependency, or record an exception in docs/policies/dependencies.md §5 and license-policy.json.",
  );
  process.exitCode = 1;
} else {
  console.log(`✓ ${checked} packages checked. All licenses are allowed by the policy.`);
}
