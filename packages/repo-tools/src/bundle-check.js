// What a self-contained bundle may hold (feature 084), checked on the unpacked folder, as
// packages:check does for the npm packages: nothing beyond Node.js, the package and the packages
// its dependencies pull in, the launcher and the two notices; no settings, keys or npm leftovers.
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { collectPackages } from "./notices.js";
import { checkPack, PUBLISHED } from "./packs.js";

/** The top of a bundle. */
const TOP = new Set(["bin", "node", "lib", "THIRD_PARTY_NOTICES", "LICENSE"]);
const LAUNCHERS = new Set(["bin/rmk-server", "bin/rmk-server.cmd"]);
const PACKAGE = "lib/node_modules/@ronneai/marketplace/";

/** Never in lib/ (Node's own folder is the official build and isn't looked into). */
const FORBIDDEN = [
  [/(^|\/)\.env(\.[^/]*)?$/, "a settings file"],
  [/(^|\/)\.npmrc$/, "an npm settings file"],
  [/(^|\/)\.package-lock\.json$|(^|\/)package-lock\.json$/, "an npm lockfile"],
  [/(^|\/)node_modules\/\.bin\//, "npm's .bin links"],
  [/\.(tgz|pem|key|p12)$/, "a tarball or a key"],
  [/(^|\/)\.DS_Store$/, "a macOS folder file"],
  [/(^|\/)\.git\//, "a git folder"],
  [/^lib\/node_modules\/@ronneai\/marketplace\/app\/apps\/web\/src\//, "the web app's source"],
];

const files = (root) =>
  readdirSync(root, { recursive: true })
    .map((path) => String(path).split(sep).join("/"))
    .filter((path) => !lstatSync(join(root, path)).isDirectory());

/** The folder of the package a path under lib/node_modules/ belongs to (the innermost one). */
const packageFolder = (path) => {
  const parts = path.split("/");
  let end = -1;
  for (let i = 0; i < parts.length - 1; i++)
    if (parts[i] === "node_modules" && parts[i + 1] !== ".bin")
      end = parts[i + 1]?.startsWith("@") ? i + 2 : i + 1;
  return end < 0 ? undefined : parts.slice(0, end + 1).join("/");
};

/**
 * The package folders the marketplace's dependencies (and optional dependencies present here)
 * reach, resolved as Node does: a folder's own node_modules first, then each parent's.
 */
const reachable = (root) => {
  const reached = new Set();
  const visit = (folder) => {
    if (reached.has(folder)) return;
    reached.add(folder);
    const pkg = JSON.parse(readFileSync(join(root, folder, "package.json"), "utf8"));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      let base = folder;
      for (;;) {
        const candidate = `${base}/node_modules/${dep}`;
        if (existsSync(join(root, candidate, "package.json"))) {
          visit(candidate);
          break;
        }
        const up = base.lastIndexOf("/node_modules/");
        if (up < 0) break; // not installed here: an optional dependency for another platform
        base = base.slice(0, up);
      }
    }
  };
  visit(PACKAGE.slice(0, -1));
  return reached;
};

/**
 * Problems with an unpacked bundle at `root` (rmk-server-X.Y.Z-platform-arch/), empty when it's
 * fine.
 */
export const checkBundle = (root) => {
  const problems = [];
  const all = files(root);
  for (const top of readdirSync(root))
    if (!TOP.has(top)) problems.push(`${top} isn't part of a bundle`);
  if (!existsSync(join(root, "node", "LICENSE"))) problems.push("node/ isn't a Node.js build");
  for (const path of all.filter((p) => p.startsWith("bin/")))
    if (!LAUNCHERS.has(path)) problems.push(`${path} isn't a launcher`);
  if (!all.some((p) => LAUNCHERS.has(p))) problems.push("there's no launcher in bin/");

  const lib = all.filter((p) => p.startsWith("lib/"));
  for (const path of lib)
    for (const [pattern, what] of FORBIDDEN)
      if (pattern.test(path)) problems.push(`${path} is ${what}`);
  for (const path of lib.filter((p) => !p.startsWith("lib/node_modules/")))
    problems.push(`${path} is outside lib/node_modules/`);

  // The package's own files, by 082's rules for what it publishes.
  const own = lib
    .filter((p) => p.startsWith(PACKAGE))
    .map((p) => ({ path: p.slice(PACKAGE.length) }));
  problems.push(
    ...checkPack("server", { name: PUBLISHED.server.name, files: own }).map(
      (problem) => `@ronneai/marketplace ${problem}`,
    ),
  );

  // Every other package, at any depth, must be one its dependencies reach.
  const reached = reachable(root);
  const strays = new Set(
    lib
      .filter((p) => p.startsWith("lib/node_modules/") && !p.startsWith(PACKAGE))
      .map(packageFolder)
      .filter((folder) => folder && !reached.has(folder)),
  );
  for (const folder of strays) problems.push(`${folder} isn't a dependency`);

  // The web app's packages, in the package's app/, must each be in its notices: so nothing stray
  // is there, and the notices miss none of them.
  // Each folder there is a package with a name and version (assemble.mjs flattens them), so
  // nothing hides in one the notices can't name.
  const appModules = join(root, PACKAGE, "app", "node_modules");
  if (existsSync(appModules))
    for (const entry of readdirSync(appModules)) {
      const folders = entry.startsWith("@")
        ? readdirSync(join(appModules, entry)).map((name) => `${entry}/${name}`)
        : [entry];
      for (const folder of folders) {
        const manifest = join(appModules, folder, "package.json");
        const pkg = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")) : {};
        if (!pkg.name || !pkg.version)
          problems.push(
            `${PACKAGE}app/node_modules/${folder} isn't a package with a name and version`,
          );
      }
    }
  const noticesPath = join(root, PACKAGE, "THIRD_PARTY_NOTICES");
  if (existsSync(noticesPath)) {
    const notices = readFileSync(noticesPath, "utf8");
    for (const pkg of collectPackages(join(root, PACKAGE, "app")))
      if (!notices.includes(`\n${pkg.name} ${pkg.version} (`))
        problems.push(
          `${pkg.name} ${pkg.version}, in @ronneai/marketplace's app/, isn't in its THIRD_PARTY_NOTICES`,
        );
  }
  return problems;
};
