#!/usr/bin/env node
// Usage: node packages/repo-tools/src/notices.js --out FILE [--filter PACKAGE …]
// THIRD_PARTY_NOTICES for what a package ships (feature 084): every production dependency of the
// filtered workspace packages, from `pnpm licenses list --prod --json`, with its licence text. The
// web app's dependencies are mostly compiled into Next's server chunks, so they can only be listed
// from the repository's dependency tree, not from what's in the package's node_modules.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** LICENSE, LICENCE, COPYING or NOTICE, as text (.md, .txt) or per licence (LICENSE-MIT); never a source file. */
export const LICENSE_FILE = /^(licen[cs]e|copying|notice)(-[a-z0-9.-]+)?(\.(md|txt|markdown))?$/i;

/** The MIT licence, for the few packages that say MIT but ship no licence file. */
export const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** The licence files in a package's folder, joined. */
export const licenseFiles = (folder) =>
  readdirSync(folder)
    .filter((name) => LICENSE_FILE.test(name))
    .sort()
    .map((name) => readFileSync(join(folder, name), "utf8").trim())
    .join("\n\n");

/**
 * One entry per name@version, sorted, from pnpm's `licenses list --json` (licence → packages, each
 * with its versions and their folders in the store). `read` gives a folder's licence text.
 */
export const noticeEntries = (byLicense, read = licenseFiles) => {
  const entries = new Map();
  for (const [license, packages] of Object.entries(byLicense))
    for (const pkg of packages)
      pkg.versions.forEach((version, index) => {
        const key = `${pkg.name}@${version}`;
        if (entries.has(key)) return;
        const folder = pkg.paths[index] ?? pkg.paths[0];
        entries.set(key, { name: pkg.name, version, license, text: folder ? read(folder) : "" });
      });
  return [...entries.values()].sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
};

/**
 * Every package in a folder tree, once per name@version: in any node_modules folder, nested and
 * scoped ones included, and in packages that carry their own (the server's app/node_modules).
 */
export const collectPackages = (root, skip = []) => {
  const found = new Map();
  const isFolder = (path) => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
  const walk = (folder) => {
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry);
      if (!isFolder(path)) continue;
      if (entry === "node_modules") visitModules(path);
      else if (!entry.startsWith(".")) walk(path);
    }
  };
  const visitModules = (nodeModules) => {
    for (const entry of readdirSync(nodeModules)) {
      if (entry.startsWith(".")) continue;
      const path = join(nodeModules, entry);
      if (!isFolder(path)) continue;
      const folders = entry.startsWith("@")
        ? readdirSync(path)
            .map((name) => join(path, name))
            .filter(isFolder)
        : [path];
      for (const folder of folders) {
        if (skip.some((name) => folder.endsWith(join("node_modules", name)))) continue;
        const manifest = join(folder, "package.json");
        if (existsSync(manifest)) {
          const { name, version, license } = JSON.parse(readFileSync(manifest, "utf8"));
          // A stray package.json (no version) inside a package isn't a package of its own.
          if (name && version && !found.has(`${name}@${version}`))
            found.set(`${name}@${version}`, {
              name,
              version,
              license: typeof license === "string" ? license : "UNKNOWN",
              text: licenseFiles(folder),
            });
        }
        walk(folder);
      }
    }
  };
  if (isFolder(root)) walk(root);
  return [...found.values()].sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
};

/** `entries` plus the scanned packages it doesn't have (by name@version), sorted. */
export const withScanned = (entries, scanned) => {
  const have = new Set(entries.map((entry) => `${entry.name}@${entry.version}`));
  return [...entries, ...scanned.filter((pkg) => !have.has(`${pkg.name}@${pkg.version}`))].sort(
    (a, b) =>
      a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
};

export const RULE = "-".repeat(78);

/** One package's section: the heading the bundle also looks for, then its licence. */
export const section = ({ name, version, license, text }) => {
  const body =
    text ||
    (license === "MIT"
      ? `(No licence file in the package; its package.json says MIT, whose text is:)\n\n${MIT_TEXT}`
      : `(No licence file in the package; its package.json says ${license}.)`);
  return `${name} ${version} (${license})\n\n${body}`;
};

export const renderNotices = (title, entries) =>
  `${title}\n\n${entries.map(section).join(`\n\n${RULE}\n\n`)}\n`;

const main = () => {
  const args = process.argv.slice(2);
  const filters = [];
  const scans = [];
  let out;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--filter") filters.push(args[++i]);
    else if (args[i] === "--scan") scans.push(args[++i]);
    else if (args[i] === "--out") out = args[++i];
  }
  if (!out) throw new Error("Give --out FILE.");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const json = execFileSync(
    "pnpm",
    [...filters.flatMap((name) => ["--filter", name]), "licenses", "list", "--prod", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === "win32",
    },
  );
  // pnpm's list leaves out optional dependencies (pg's pg-cloudflare) and doesn't follow
  // workspace links; a --scan folder adds every package that's really there and isn't listed.
  const entries = withScanned(
    noticeEntries(JSON.parse(json)),
    scans.flatMap((dir) => collectPackages(dir)),
  );
  writeFileSync(
    resolve(out),
    renderNotices(
      `Third-party software in ${filters.join(", ") || "this repository"}: every production dependency, with its licence (feature 084).`,
      entries,
    ),
  );
  console.log(`${out}: ${entries.length} packages`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
