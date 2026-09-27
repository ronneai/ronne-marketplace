// pnpm db:migrate — applies pending migrations to DATABASE_URL.
// Reads DATABASE_URL from the environment, or from .env when it isn't set.
import { existsSync } from "node:fs";
import { createDb } from "../src/server/db/create-db";
import { migrateToLatest } from "../src/server/db/migrate";
import { redactDatabaseUrl } from "../src/server/db/url";

if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "✗ DATABASE_URL isn't set. Run `pnpm run setup` first, or set it in the environment.",
  );
  process.exit(2);
}

const { db, dialect } = createDb(url);
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
