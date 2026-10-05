#!/usr/bin/env node
// Usage: node packages/repo-tools/src/bundle-smoke.js <archive>
// Smoke-tests a self-contained bundle (feature 084) the way it'll be used: unpacked, then run with
// no Node.js on PATH at all. Every folder on PATH that holds a node is left out, so only the
// bundle's own can run. Then `rmk-server --version` must name Ronne's and the bundled Node's
// versions, and 082's server-probe.js (start, 503, setup --yes, 200, a token, stop) runs against
// the launcher, itself run by the bundled Node.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundle } from "./bundle-check.js";

const windows = process.platform === "win32";

/** PATH without any folder that holds a Node.js. */
export const pathWithoutNode = (path, platform = process.platform, exists = existsSync) =>
  path
    .split(platform === "win32" ? ";" : ":")
    .filter((dir) => dir && !exists(join(dir, platform === "win32" ? "node.exe" : "node")))
    .join(platform === "win32" ? ";" : ":");

/** The archive's folder name: rmk-server-X.Y.Z-platform-arch. */
export const archiveFolder = (archive) => basename(archive).replace(/\.(tar\.gz|zip)$/, "");

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const main = () => {
  const archive = process.argv[2];
  if (!archive || !existsSync(archive)) fail("Give the bundle's archive.");
  const work = mkdtempSync(join(tmpdir(), "rmk-bundle-smoke-"));
  // On Windows a file can stay locked a moment after the server stops: retry, and never let the
  // cleanup turn a passing run into a failure.
  process.on("exit", () => {
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(`(couldn't remove ${work}: ${error.message})`);
    }
  });
  // Windows' own tar (bsdtar) reads zip; elsewhere tar reads the .tar.gz.
  const tar = windows
    ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
    : "tar";
  execFileSync(tar, ["-xf", archive, "-C", work]);
  // One folder, named as the archive: rmk-server-X.Y.Z-platform-arch.
  const inside = readdirSync(work);
  if (inside.length !== 1 || inside[0] !== archiveFolder(archive))
    fail(
      `${basename(archive)} unpacks to ${inside.join(", ") || "nothing"}, not ${archiveFolder(archive)}/`,
    );
  const root = join(work, archiveFolder(archive));
  const problems = checkBundle(root);
  if (problems.length > 0) fail(`it holds what it shouldn't:\n  ${problems.join("\n  ")}`);
  console.log(
    "✓ it holds only Node.js, the package and its dependencies, the launcher and notices",
  );
  const launcher = join(root, "bin", windows ? "rmk-server.cmd" : "rmk-server");
  const node = join(root, "node", ...(windows ? ["node.exe"] : ["bin", "node"]));
  const version = JSON.parse(
    readFileSync(
      join(root, "lib", "node_modules", "@ronneai", "marketplace", "package.json"),
      "utf8",
    ),
  ).version;
  // The archive's name must say the version inside it (rmk-server-X.Y.Z-platform-arch).
  if (!archiveFolder(archive).startsWith(`rmk-server-${version}-`))
    fail(`${basename(archive)} holds @ronneai/marketplace ${version}, not the version in its name`);

  const env = { ...process.env, PATH: pathWithoutNode(process.env.PATH ?? "") };
  const found = spawnSync(windows ? "where" : "which", ["node"], { env, encoding: "utf8" });
  if (found.status === 0) fail(`a node is still on PATH: ${found.stdout.trim()}`);
  console.log("✓ no Node.js on PATH");

  const run = (args) =>
    spawnSync(windows ? `"${launcher}" ${args.join(" ")}` : launcher, windows ? [] : args, {
      env,
      encoding: "utf8",
      shell: windows,
    });
  const shown = run(["--version"]);
  const lines = (shown.stdout ?? "").trim().split(/\r?\n/);
  if (
    shown.status !== 0 ||
    lines[0] !== version ||
    !/^Node\.js 24\.\d+\.\d+ \(bundled\)$/.test(lines[1] ?? "")
  )
    fail(
      `--version printed ${JSON.stringify(shown.stdout)} (exit ${shown.status}), not ${version} and the bundled Node`,
    );
  console.log(`✓ rmk-server --version: ${lines.join(", ")}`);

  const probe = fileURLToPath(new URL("./server-probe.js", import.meta.url));
  const result = spawnSync(node, [probe, launcher], { env, stdio: "inherit" });
  if (result.status !== 0) fail(`server-probe.js failed (exit ${result.status})`);
  console.log(`✓ ${basename(archive)} runs with its own Node.js, none on PATH`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
