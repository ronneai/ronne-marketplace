// Copies the web app's standalone build into app/ for the npm package (feature 082). Run at pack
// time (`prepack`), after `NEXT_OUTPUT=standalone pnpm --filter "@ronneai/web..." build`.
//
// The standalone output keeps pnpm's layout: a store with symlinks, and hashed links in
// .next/node_modules (better-sqlite3-<hash>) for the server's external modules. npm can't carry
// symlinks, and the native modules in it are built for this machine only. So:
//   1. apps/web is copied with symlinks resolved, plus .next/static and dist-scripts/;
//   2. the store is flattened into one plain app/node_modules, without the native modules;
//   3. each hashed link becomes a one-line re-export of the real package;
//   4. the native modules are the package's dependencies, so npm installs each platform's build.
// Never a .env: Next's standalone output copies the build machine's, with its AUTH_SECRET.
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(packageDir, "..", "..", "apps", "web");
const standalone = join(web, ".next", "standalone");
const app = join(packageDir, "app");

/** Native modules: never copied, installed by npm for the platform instead. */
export const NATIVE = ["better-sqlite3", "@node-rs/argon2"];
const isNative = (name) => NATIVE.includes(name) || name.startsWith("@node-rs/argon2-");
const isEnvFile = (path) => /^\.env(\..*)?$/.test(path.split(sep).at(-1) ?? "");

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

if (!existsSync(join(standalone, "apps", "web", "server.js")))
  fail(
    `No standalone build in ${relative(process.cwd(), standalone)}. Run: NEXT_OUTPUT=standalone pnpm --filter "@ronneai/web..." build`,
  );
if (!existsSync(join(web, "dist-scripts", "start.mjs")))
  fail("No dist-scripts in apps/web: build the web app first.");

// The package's dependencies must be the versions the web app was built and tested with.
const webDeps = JSON.parse(readFileSync(join(web, "package.json"), "utf8")).dependencies;
const ownDeps = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).dependencies;
for (const name of NATIVE)
  if (ownDeps[name] !== webDeps[name])
    fail(
      `${name} is ${ownDeps[name]} in packages/server but ${webDeps[name]} in apps/web: make them the same.`,
    );

rmSync(app, { recursive: true, force: true });

// 1. The app, without its node_modules (rebuilt below) and without any .env.
const standaloneWeb = join(standalone, "apps", "web");
cpSync(standaloneWeb, join(app, "apps", "web"), {
  recursive: true,
  dereference: true,
  filter: (source) => {
    const rel = relative(standaloneWeb, source);
    return !(
      rel === "node_modules" ||
      rel.startsWith(`node_modules${sep}`) ||
      rel === join(".next", "node_modules") ||
      rel.startsWith(join(".next", "node_modules") + sep) ||
      isEnvFile(rel)
    );
  },
});
cpSync(join(web, ".next", "static"), join(app, "apps", "web", ".next", "static"), {
  recursive: true,
});
if (existsSync(join(web, "public")))
  cpSync(join(web, "public"), join(app, "apps", "web", "public"), { recursive: true });
cpSync(join(web, "dist-scripts"), join(app, "apps", "web", "dist-scripts"), { recursive: true });

// 2. The store, flattened: each package once. When two versions were traced, the one with real
// files wins (the other is a stray package.json; pg-protocol in Next 16.3).
const store = join(standalone, "node_modules", ".pnpm");
const flat = join(app, "node_modules");
const fileCount = (dir) => readdirSync(dir, { recursive: true }).length;
const placed = new Map();
for (const entry of readdirSync(store)) {
  if (entry === "node_modules") continue;
  const modules = join(store, entry, "node_modules");
  const names = readdirSync(modules).flatMap((top) =>
    top.startsWith("@") ? readdirSync(join(modules, top)).map((sub) => `${top}/${sub}`) : [top],
  );
  for (const name of names) {
    const dir = join(modules, name);
    if (lstatSync(dir).isSymbolicLink() || isNative(name)) continue;
    if (placed.has(name)) {
      if (fileCount(dir) <= fileCount(join(flat, name))) continue;
      rmSync(join(flat, name), { recursive: true });
    }
    placed.set(name, JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version);
    cpSync(dir, join(flat, name), {
      recursive: true,
      dereference: true,
      filter: (s) => !isEnvFile(s),
    });
  }
}

// 3. The hashed externals, as one-line re-exports.
const externals = join(standaloneWeb, ".next", "node_modules");
const linkNames = readdirSync(externals).flatMap((top) =>
  top.startsWith("@") ? readdirSync(join(externals, top)).map((sub) => `${top}/${sub}`) : [top],
);
for (const link of linkNames) {
  const name = link.replace(/-[0-9a-f]{16}$/, "");
  if (!isNative(name) && !placed.has(name))
    fail(`The server loads ${name}, which isn't in the standalone output.`);
  const dir = join(app, "apps", "web", ".next", "node_modules", link);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: link, main: "index.js" })}\n`);
  writeFileSync(join(dir, "index.js"), `module.exports = require(${JSON.stringify(name)});\n`);
}

// 4. What must never ship: a .env, a symlink, a native binary built for this machine.
const problems = [];
for (const rel of readdirSync(app, { recursive: true })) {
  const path = join(app, rel);
  if (lstatSync(path).isSymbolicLink()) problems.push(`symlink ${rel}`);
  else if (isEnvFile(rel)) problems.push(`settings file ${rel}`);
  else if (rel.endsWith(".node")) problems.push(`native binary ${rel}`);
}
if (problems.length) fail(`app/ has what must not ship:\n  ${problems.join("\n  ")}`);

console.log(
  `✓ app/: the web app, ${placed.size} packages flattened, ${linkNames.length} externals; npm installs ${NATIVE.join(" and ")}.`,
);
