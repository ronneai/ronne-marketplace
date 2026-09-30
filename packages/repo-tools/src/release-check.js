#!/usr/bin/env node
// Usage: node packages/repo-tools/src/release-check.js <tag>   (for example v0.1.0)
// Checks that the tag names the version core, rmk, the MCP server and the web app (its Docker
// image, 035) share, and prints it; the release workflow stops here when they differ, before
// publishing anything (feature 034).
import { readFileSync } from "node:fs";
import { sharedVersion, VERSIONED } from "./release.js";

const tag = process.argv[2] ?? "";
try {
  const texts = Object.fromEntries(
    Object.entries(VERSIONED).map(([key, path]) => [
      key,
      readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8"),
    ]),
  );
  const version = sharedVersion(texts);
  if (tag !== `v${version}`)
    throw new Error(
      `The tag ${tag || "(none)"} doesn't match the packages' version, ${version}: tag v${version}, or run pnpm release:version first.`,
    );
  console.log(version);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
