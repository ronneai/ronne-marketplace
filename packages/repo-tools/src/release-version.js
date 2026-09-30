#!/usr/bin/env node
// Usage: pnpm release:version <version>   (for example 0.1.0)
// Sets one version in core, rmk and the MCP server's package.json (feature 034), and in the web
// app's, whose Docker image carries it (035).
import { readFileSync, writeFileSync } from "node:fs";
import { PUBLISHED } from "./packs.js";
import { VERSIONED, withVersion } from "./release.js";

const version = process.argv[2] ?? "";
const url = (key) => new URL(`../../../${VERSIONED[key]}`, import.meta.url);
const texts = Object.fromEntries(
  Object.keys(VERSIONED).map((key) => [key, readFileSync(url(key), "utf8")]),
);
try {
  const next = withVersion(texts, version);
  for (const [key, text] of Object.entries(next)) writeFileSync(url(key), text);
  console.log(
    `✓ ${Object.values(PUBLISHED)
      .map((p) => p.name)
      .join(", ")} and the web app are now ${version}.`,
  );
  console.log(`  Commit it, and push the tag v${version} to publish.`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
