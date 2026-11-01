#!/usr/bin/env node
// Usage: node packages/repo-tools/src/release-bump.js <tag>   (for example v0.6.0)
// Run by the release workflow once a release is complete: moves every package.json in VERSIONED
// to the next minor (nextMinor) and prints that version; prints nothing, and changes nothing,
// after a pre-release or when main is already there or past it. Plain Node.js with no
// dependencies, so the job that pushes to main installs and runs nothing else.
import { readFileSync, writeFileSync } from "node:fs";
import { nextMinor, sharedVersion, VERSIONED, withVersion } from "./release.js";

const tag = process.argv[2] ?? "";
const url = (key) => new URL(`../../../${VERSIONED[key]}`, import.meta.url);
try {
  if (!tag.startsWith("v")) throw new Error(`${tag || "(none)"} isn't a tag such as v0.1.0.`);
  const released = tag.slice(1);
  const texts = Object.fromEntries(
    Object.keys(VERSIONED).map((key) => [key, readFileSync(url(key), "utf8")]),
  );
  const current = sharedVersion(texts);
  const next = nextMinor(released, current);
  if (next === null) {
    console.error(`main stays at ${current} after ${tag}.`);
  } else {
    for (const [key, text] of Object.entries(withVersion(texts, next)))
      writeFileSync(url(key), text);
    console.error(`main moves from ${current} to ${next} after ${tag}.`);
    console.log(next);
  }
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
