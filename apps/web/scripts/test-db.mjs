// Runs the database tests (the `db` Vitest project) against one of the local servers from
// docker/test-databases.compose.yml. Plain Node, so it works on every OS without extra tools.
// Usage: node scripts/test-db.mjs <postgres|mysql|mariadb> [extra vitest arguments]
import { spawnSync } from "node:child_process";

const URLS = {
  postgres: "postgres://postgres:ronne-test@127.0.0.1:54315/postgres",
  mysql: "mysql://root:ronne-test@127.0.0.1:53384/ronne",
  mariadb: "mysql://root:ronne-test@127.0.0.1:53311/ronne",
};

// `pnpm test:db:mysql -- <file>` passes a literal `--` along; drop it so Vitest sees the filter.
const [target, ...rest] = process.argv.slice(2).filter((arg, i) => !(i === 1 && arg === "--"));
const url = URLS[target];
if (!url) {
  console.error(`Usage: node scripts/test-db.mjs <${Object.keys(URLS).join("|")}>`);
  process.exit(2);
}

console.log(`Database tests against ${target} (start it first with \`pnpm test:db:up\`)`);
// The script tests run setup and migrate through tsx, which loads @ronneai/core from its build.
const built = spawnSync("pnpm", ["--filter", "@ronneai/core", "--silent", "build"], {
  stdio: "inherit",
});
if (built.status !== 0) process.exit(built.status ?? 1);
const result = spawnSync("pnpm", ["exec", "vitest", "run", "--project", "db", ...rest], {
  stdio: "inherit",
  env: { ...process.env, TEST_DATABASE_URL: url },
});
process.exit(result.status ?? 1);
