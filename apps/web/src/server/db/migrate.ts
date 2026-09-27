import type { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import { migrations as allMigrations } from "./migrations";
import type { AppMigration } from "./migrations/types";
import type { DatabaseDialect } from "./url";

export const MIGRATION_TABLE = "ronne_migration";
export const MIGRATION_LOCK_TABLE = "ronne_migration_lock";

/** The database has migrations this version of Ronne doesn't know: it was migrated by a newer version. */
export class DatabaseAheadOfAppError extends Error {
  constructor(readonly unknownMigrations: string[]) {
    super(
      `The database was migrated by a newer version of Ronne (unknown migrations: ${unknownMigrations.join(", ")}). ` +
        "Upgrade Ronne instead of running an older version against this database.",
    );
    this.name = "DatabaseAheadOfAppError";
  }
}

export class MigrationFailedError extends Error {
  constructor(
    readonly migration: string,
    readonly applied: string[],
    options: { cause: unknown },
  ) {
    super(
      `Migration ${migration} failed: ${String((options.cause as Error)?.message ?? options.cause)}`,
      options,
    );
    this.name = "MigrationFailedError";
  }
}

// biome-ignore lint/suspicious/noExplicitAny: migrations run before the typed schema exists.
type AnyDb = Kysely<any>;

const executedMigrations = async (db: AnyDb): Promise<string[]> => {
  const tables = await db.introspection.getTables();
  if (!tables.some((t) => t.name === MIGRATION_TABLE)) return [];
  const rows = await db.selectFrom(MIGRATION_TABLE).select("name").execute();
  return rows.map((r) => r.name as string);
};

/**
 * Runs every pending migration, in order, and returns the names it applied (empty when the database
 * is already up to date). Stops at the first failure; migrations before it stay applied.
 */
export const migrateToLatest = async <DB>(
  db: Kysely<DB>,
  dialect: DatabaseDialect,
  migrations: Record<string, AppMigration> = allMigrations,
): Promise<string[]> => {
  const anyDb = db as AnyDb;
  const known = new Set(Object.keys(migrations));
  const unknown = (await executedMigrations(anyDb)).filter((name) => !known.has(name));
  if (unknown.length > 0) throw new DatabaseAheadOfAppError(unknown);

  const migrator = new Migrator({
    db: anyDb,
    migrationTableName: MIGRATION_TABLE,
    migrationLockTableName: MIGRATION_LOCK_TABLE,
    provider: {
      getMigrations: async () =>
        Object.fromEntries(
          Object.entries(migrations).map(([name, migration]) => [name, migration(dialect)]),
        ),
    },
  });

  const { error, results = [] } = await migrator.migrateToLatest();
  const applied = results.filter((r) => r.status === "Success").map((r) => r.migrationName);
  if (error) {
    const failed =
      results.find((r) => r.status === "Error")?.migrationName ?? "(before any migration)";
    throw new MigrationFailedError(failed, applied, { cause: error });
  }
  return applied;
};
