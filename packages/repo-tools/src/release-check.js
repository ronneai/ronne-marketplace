#!/usr/bin/env node
// Usage: node packages/repo-tools/src/release-check.js <tag>   (for example v0.1.0)
// Checks that the tag names the version core, rmk and the MCP server share, and prints it; the
// release workflow stops here when they differ, before publishing anything (feature 034).
import { readFileSync } from "node:fs";
import { PUBLISHED } from "./packs.js";
import { sharedVersion } from "./release.js";

const tag = process.argv[2] ?? "";
try {
  const texts = Object.fromEntries(
    Object.keys(PUBLISHED).map((folder) => [
      folder,
      readFileSync(new URL(`../../${folder}/package.json`, import.meta.url), "utf8"),
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
