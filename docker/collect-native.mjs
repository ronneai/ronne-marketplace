// Copies the native modules the compiled scripts need (better-sqlite3 and @node-rs/argon2), with
// their runtime dependencies, into one node_modules folder for the image. Next.js's standalone
// output only links what the server uses, under hashed names the scripts can't import.
// Usage (in the build stage): node docker/collect-native.mjs <app dir> <target node_modules>
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

const [appDir, target] = process.argv.slice(2);
if (!appDir || !target) {
  console.error("Usage: node docker/collect-native.mjs <app dir> <target node_modules>");
  process.exit(2);
}

// Build-only content that isn't needed at runtime (better-sqlite3 ships SQLite's C source).
const SKIP = new Set(["deps", "src", "docs", "test", "tests", "benchmark", ".github"]);
const copied = new Set();

function packageDir(name, fromDir) {
  const require = createRequire(join(fromDir, "noop.js"));
  try {
    return realpathSync(dirname(require.resolve(`${name}/package.json`)));
  } catch {
    return undefined; // an optional dependency for another platform
  }
}

function collect(name, fromDir) {
  if (copied.has(name)) return;
  const dir = packageDir(name, fromDir);
  if (!dir) return;
  copied.add(name);
  const destination = join(target, name);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(dir, destination, {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const top = relative(dir, source).split(sep)[0] ?? "";
      return !(SKIP.has(top) || top === "node_modules");
    },
  });
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    collect(dependency, dir);
  }
}

for (const name of ["better-sqlite3", "@node-rs/argon2"]) collect(name, resolve(appDir));
if (!existsSync(join(target, "better-sqlite3")) || !existsSync(join(target, "@node-rs/argon2"))) {
  console.error("✗ Couldn't find the native modules. Run pnpm install first.");
  process.exit(1);
}
console.log(`Collected: ${[...copied].join(", ")}`);
