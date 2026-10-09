#!/usr/bin/env node
// Reads changed file paths (one per line) on stdin and prints which database tests a pull request
// runs on the servers (database.yml, feature 112): "all" when it changes database code, "core"
// otherwise. "core" is the tests of the database code itself (CORE_TESTS); the rest run on SQLite
// in ci.yml, and everything runs on the servers on main, weekly and by hand. An empty list prints
// "all", so detection never narrows the tests by accident.
import { existsSync, readFileSync } from "node:fs";

/** Vitest filters (parts of a path) for the tests a pull request always runs on the servers. */
export const CORE_TESTS = ["src/server/db/", "/repositories/", "src/server/setup/", "scripts/"];

/** Paths that are database code, or decide how the database tests run. */
const DATABASE_PATHS = [
  /^apps\/web\/src\/server\/db\//,
  /\/repositories\//,
  /^apps\/web\/src\/server\/setup\//,
  // setup, db:migrate and reset-root-password, run against the database.
  /^apps\/web\/scripts\//,
  // A database test itself, wherever it is.
  /\.db\.test\.ts$/,
  // The drivers and Kysely come in through the dependencies.
  /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/,
  /^apps\/web\/vitest\.config\.ts$/,
  /^packages\/config\/vitest\.js$/,
  /^apps\/web\/scripts\/test-db\.mjs$/,
  /^docker\/test-databases\.compose\.yml$/,
  /^\.github\/workflows\/(database|changes)\.yml$/,
  /^packages\/repo-tools\/src\/db-scope\.js$/,
];

/** What a file holds when it queries the database, wherever it is (Kysely or raw SQL). */
const QUERIES =
  /from ["']kysely["']|\bsql`|\.(selectFrom|insertInto|updateTable|deleteFrom|replaceInto|mergeInto)\(|\.schema\./;

/**
 * @param {string[]} files paths relative to the repo root
 * @param {(path: string) => string | null} read a file's contents, or null when it's gone
 * @returns {"all" | "core"}
 */
export const databaseScope = (files, read) => {
  if (files.length === 0) return "all";
  for (const file of files) {
    if (DATABASE_PATHS.some((path) => path.test(file))) return "all";
    if (!/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(file)) continue;
    const contents = read(file);
    // Deleted: what it held can't be read here, so it may have been database code.
    if (contents === null || QUERIES.test(contents)) return "all";
  }
  return "core";
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = readFileSync(0, "utf8")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const read = (/** @type {string} */ path) =>
    existsSync(path) ? readFileSync(path, "utf8") : null;
  process.stdout.write(databaseScope(files, read));
}
