#!/usr/bin/env node
// Usage: pnpm release:version <version>   (for example 0.1.0)
// Sets one version in core, rmk and the MCP server's package.json (feature 034).
import { readFileSync, writeFileSync } from "node:fs";
import { PUBLISHED } from "./packs.js";
import { withVersion } from "./release.js";

const version = process.argv[2] ?? "";
const path = (folder) => new URL(`../../${folder}/package.json`, import.meta.url);
const texts = Object.fromEntries(
  Object.keys(PUBLISHED).map((folder) => [folder, readFileSync(path(folder), "utf8")]),
);
try {
  const next = withVersion(texts, version);
  for (const [folder, text] of Object.entries(next)) writeFileSync(path(folder), text);
  console.log(
    `✓ ${Object.values(PUBLISHED)
      .map((p) => p.name)
      .join(", ")} are now ${version}.`,
  );
  console.log(`  Commit it, and push the tag v${version} to publish.`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
