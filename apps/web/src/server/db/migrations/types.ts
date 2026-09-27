import type { Migration } from "kysely/migration";
import type { DatabaseDialect } from "../url";

/**
 * A migration gets the dialect, so it can use columnTypes() instead of checking the dialect itself.
 * Migrations only move forward: there are no `down` steps.
 */
export type AppMigration = (dialect: DatabaseDialect) => Migration;
