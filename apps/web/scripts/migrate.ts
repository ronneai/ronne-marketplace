// pnpm db:migrate — applies pending migrations to DATABASE_URL.
// Reads DATABASE_URL from the environment, or from the settings file (RONNE_ENV_FILE or .env).
import { resolve } from "node:path";
import { loadConfig } from "../src/server/config";
import { createDb } from "../src/server/db/create-db";
import { migrateToLatest } from "../src/server/db/migrate";
import { redactDatabaseUrl } from "../src/server/db/url";

const appDir = resolve(import.meta.dirname, "..");
const url = loadConfig({ appDir }).databaseUrl;
if (!url) {
  console.error(
    "✗ DATABASE_URL isn't set. Run `pnpm run setup` first, or set it in the environment.",
  );
  process.exit(2);
}

const { db, dialect } = createDb(url, { baseDir: appDir });
try {
  console.log(`Migrating ${redactDatabaseUrl(url)} (${dialect})`);
  const applied = await migrateToLatest(db, dialect);
  if (applied.length === 0) {
    console.log("✓ Nothing to migrate: the database is up to date.");
  } else {
    for (const name of applied) console.log(`  applied ${name}`);
    console.log(`✓ Applied ${applied.length} migration${applied.length === 1 ? "" : "s"}.`);
  }
} catch (error) {
  console.error(`✗ ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
