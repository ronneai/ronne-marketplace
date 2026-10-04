#!/usr/bin/env node
// Usage: node packages/repo-tools/src/bundle.js <tarball> [--platform P] [--arch A] [--node V] [--out DIR] [--keep]
//   (pnpm bundle <tarball>, after packing @ronneai/marketplace)
// Builds one self-contained archive of rmk-server (feature 084): the official Node.js 24 build for
// the platform, the packed @ronneai/marketplace installed with npm (so the native modules are this
// platform's), a launcher and THIRD_PARTY_NOTICES. Run it on the platform it builds for: npm picks
// the native modules for the machine it runs on, and nothing here cross-compiles.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundle } from "./bundle-check.js";
import { collectPackages, RULE, section } from "./notices.js";

export const PLATFORMS = ["linux", "darwin", "win32"];
export const ARCHS = ["x64", "arm64"];
export const NODE_MAJOR = 24;
const DIST = "https://nodejs.org/dist";

/** Node's own name for a platform in its downloads. */
const nodePlatform = (platform) => (platform === "win32" ? "win" : platform);

/** The Node.js download for a platform: a .zip on Windows, a .tar.gz elsewhere. */
export const nodeArchive = (platform, arch, version) =>
  `node-v${version}-${nodePlatform(platform)}-${arch}.${platform === "win32" ? "zip" : "tar.gz"}`;

/** The newest release of a major from nodejs.org's index.json (newest first there). */
export const latestOf = (index, major) => {
  const release = index.find((entry) => entry.version.startsWith(`v${major}.`));
  if (!release) throw new Error(`nodejs.org lists no Node.js ${major} release.`);
  return release.version.slice(1);
};

/** SHASUMS256.txt as a map from file name to its SHA-256. */
export const parseShasums = (text) => {
  const sums = new Map();
  for (const line of text.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (hash && name && /^[0-9a-f]{64}$/.test(hash)) sums.set(name, hash);
  }
  return sums;
};

/** The folder and archive name of a bundle. */
export const bundleName = (version, platform, arch) => `rmk-server-${version}-${platform}-${arch}`;

/** Where the package sits inside lib/ once npm has installed it. */
const ENTRY = "lib/node_modules/@ronneai/marketplace/dist/bin.js";

/**
 * The launcher for macOS and Linux. It finds its own folder through any symbolic links (Homebrew
 * and packages link bin/rmk-server from elsewhere), then runs the bundled Node, never one on PATH.
 */
export const shLauncher = () => `#!/bin/sh
# rmk-server, self-contained (feature 084): runs the Node.js in this bundle, not one on PATH.
self=$0
while [ -L "$self" ]; do
  link=$(readlink "$self")
  case $link in
    /*) self=$link ;;
    *) self=$(dirname "$self")/$link ;;
  esac
done
root=$(cd "$(dirname "$self")/.." && pwd -P)
RONNE_BUNDLE=1 exec "$root/node/bin/node" "$root/${ENTRY}" "$@"
`;

/** The launcher for Windows. */
export const cmdLauncher = () =>
  [
    "@echo off",
    "rem rmk-server, self-contained (feature 084): runs the Node.js in this bundle, not one on PATH.",
    "setlocal",
    "set RONNE_BUNDLE=1",
    `"%~dp0..\\node\\node.exe" "%~dp0..\\${ENTRY.replaceAll("/", "\\")}" %*`,
    "",
  ].join("\r\n");

/**
 * THIRD_PARTY_NOTICES: Node.js first; then the packages npm installed beside @ronneai/marketplace
 * (its native modules) that its own notices don't already list; then its own notices, which cover
 * every production dependency of the web app (written at pack time by notices.js).
 */
export const notices = ({ nodeVersion, nodeLicense, packages, packageNotices = "" }) => {
  const listed = (pkg) => packageNotices.includes(`\n${pkg.name} ${pkg.version} (`);
  const sections = [
    `Node.js ${nodeVersion}\nhttps://nodejs.org (MIT, with the licences of its bundled dependencies below)\n\n${nodeLicense.trim()}`,
    ...packages.filter((pkg) => !listed(pkg)).map(section),
  ];
  const head = `Third-party software in this rmk-server bundle (feature 084).\n\n${sections.join(`\n\n${RULE}\n\n`)}\n`;
  return packageNotices ? `${head}\n${RULE}\n\n${packageNotices}` : head;
};

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** A GET that must succeed. */
const get = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  return response;
};

/**
 * Windows' own tar (bsdtar, in System32) reads and writes zip; a GNU tar from Git for Windows
 * earlier on PATH can't, and reads C:\… as a remote host.
 */
const tarProgram = () =>
  process.platform === "win32"
    ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
    : "tar";

const download = async (url, path) => {
  const response = await get(url);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
};

const parseArgs = (argv) => {
  const options = { platform: process.platform, arch: process.arch, out: "bundles", keep: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--platform") options.platform = argv[++i];
    else if (arg === "--arch") options.arch = argv[++i];
    else if (arg === "--node") options.node = argv[++i];
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--keep") options.keep = true;
    else rest.push(arg);
  }
  options.tarball = rest[0];
  return options;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (!options.tarball || !existsSync(options.tarball))
    throw new Error("Give the packed @ronneai/marketplace tarball: pnpm bundle <tarball>.");
  if (!PLATFORMS.includes(options.platform) || !ARCHS.includes(options.arch))
    throw new Error(`No bundle for ${options.platform}-${options.arch}.`);
  if (options.platform !== process.platform || options.arch !== process.arch)
    throw new Error(
      `Build the ${options.platform}-${options.arch} bundle on that platform: npm installs the native modules of the machine it runs on (this is ${process.platform}-${process.arch}).`,
    );
  const windows = options.platform === "win32";
  const tarball = resolve(options.tarball);
  const version = JSON.parse(
    execFileSync(tarProgram(), ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
  ).version;

  // Node.js: the newest 24 (or the one asked for), checked against nodejs.org's SHASUMS256.txt.
  const work = mkdtempSync(join(tmpdir(), "rmk-bundle-"));
  // Removed afterwards, whether the build worked or not, unless --keep.
  try {
    const nodeVersion =
      options.node ?? latestOf(await (await get(`${DIST}/index.json`)).json(), NODE_MAJOR);
    const archive = nodeArchive(options.platform, options.arch, nodeVersion);
    const shasums = await (await get(`${DIST}/v${nodeVersion}/SHASUMS256.txt`)).text();
    const expected = parseShasums(shasums).get(archive);
    if (!expected) throw new Error(`SHASUMS256.txt for ${nodeVersion} has no ${archive}.`);
    await download(`${DIST}/v${nodeVersion}/${archive}`, join(work, archive));
    const actual = sha256(join(work, archive));
    if (actual !== expected)
      throw new Error(`${archive}: SHA-256 ${actual}, but SHASUMS256.txt says ${expected}.`);
    console.log(`Node.js ${nodeVersion}: ${archive}, SHA-256 ${actual} (matches SHASUMS256.txt)`);

    // The bundle's folder.
    const name = bundleName(version, options.platform, options.arch);
    const root = join(work, name);
    mkdirSync(join(root, "bin"), { recursive: true });
    execFileSync(tarProgram(), ["-xf", join(work, archive), "-C", work]);
    renameSync(join(work, archive.replace(/\.(zip|tar\.gz)$/, "")), join(root, "node"));
    const node = windows ? join(root, "node", "node.exe") : join(root, "node", "bin", "node");
    const npmCli = windows
      ? join(root, "node", "node_modules", "npm", "bin", "npm-cli.js")
      : join(root, "node", "lib", "node_modules", "npm", "bin", "npm-cli.js");

    // The package, installed by the bundled Node's npm, so its native modules match it.
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "lib", "package.json"), '{ "private": true }\n');
    execFileSync(
      node,
      [npmCli, "install", "--omit=dev", "--no-audit", "--no-fund", "--no-package-lock", tarball],
      {
        cwd: join(root, "lib"),
        stdio: "inherit",
        env: { ...process.env, npm_config_cache: join(work, "npm-cache") },
      },
    );
    // npm's own records: .package-lock.json names the tarball's path on the build machine, and .bin
    // holds links nothing in the bundle uses.
    rmSync(join(root, "lib", "package.json"));
    rmSync(join(root, "lib", "node_modules", ".package-lock.json"), { force: true });
    rmSync(join(root, "lib", "node_modules", ".bin"), { recursive: true, force: true });

    // The launcher, the notices and Ronne's licence.
    if (windows) writeFileSync(join(root, "bin", "rmk-server.cmd"), cmdLauncher());
    else {
      writeFileSync(join(root, "bin", "rmk-server"), shLauncher());
      chmodSync(join(root, "bin", "rmk-server"), 0o755);
    }
    writeFileSync(
      join(root, "THIRD_PARTY_NOTICES"),
      notices({
        nodeVersion,
        nodeLicense: readFileSync(join(root, "node", "LICENSE"), "utf8"),
        // The package itself and its app/ are in its own notices.
        packages: collectPackages(join(root, "lib"), ["@ronneai/marketplace"]),
        packageNotices: readFileSync(
          join(root, "lib", "node_modules", "@ronneai", "marketplace", "THIRD_PARTY_NOTICES"),
          "utf8",
        ),
      }),
    );
    copyFileSync(
      fileURLToPath(new URL("../../../LICENSE", import.meta.url)),
      join(root, "LICENSE"),
    );

    // What it holds, checked before it's archived.
    const problems = checkBundle(root);
    if (problems.length > 0)
      throw new Error(`the bundle holds what it shouldn't:\n  ${problems.join("\n  ")}`);

    // The archive: tar.gz, or zip on Windows (its tar is bsdtar, which writes zip with -a).
    const out = resolve(options.out);
    mkdirSync(out, { recursive: true });
    const file = join(out, `${name}.${windows ? "zip" : "tar.gz"}`);
    rmSync(file, { force: true });
    // macOS's tar would add its extended attributes (com.apple.provenance), which GNU tar warns about.
    // And files owned by root, not by whoever built it. GNU tar (Linux) and bsdtar (macOS, Windows)
    // spell both differently.
    const neutral =
      process.platform === "linux"
        ? ["--owner=0", "--group=0", "--numeric-owner"]
        : ["--uid", "0", "--gid", "0", "--uname", "root", "--gname", "root"];
    const noXattrs = process.platform === "darwin" ? ["--no-xattrs", "--no-mac-metadata"] : [];
    const flags = [windows ? "-a" : "-z", ...neutral, ...noXattrs];
    execFileSync(tarProgram(), [...flags, "-cf", file, "-C", work, name], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    console.log(
      `${basename(file)}: ${(statSync(file).size / 1e6).toFixed(1)} MB, SHA-256 ${sha256(file)}`,
    );
    if (options.keep) console.log(`Unpacked in ${root} (kept)`);
  } finally {
    if (!options.keep) rmSync(work, { recursive: true, force: true });
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(`bundle: ${error.message}`);
    process.exit(1);
  });
