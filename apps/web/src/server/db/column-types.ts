import { type ColumnDataType, type Expression, sql } from "kysely";
import type { DatabaseDialect } from "./url";

type ColumnType = ColumnDataType | Expression<unknown>;

/**
 * Column types for migrations, so a migration never checks the dialect itself (MVP §9.4).
 * Indexed strings need an explicit length, because MySQL can't index `text`.
 */
export const columnTypes = (dialect: DatabaseDialect) => {
  return {
    /** A ULID primary or foreign key. */
    id: (): ColumnType => "varchar(26)",
    /** An indexed or length-limited string. */
    string: (length: number): ColumnType => `varchar(${length})`,
    /** Unindexed text of any length. */
    text: (): ColumnType => "text",
    /**
     * A UTC timestamp: `timestamptz` in PostgreSQL, `datetime(3)` in MySQL, ISO-8601 text in SQLite.
     * Never MySQL's `timestamp`, which ends in 2038.
     */
    timestamp: (): ColumnType => {
      if (dialect === "postgres") return "timestamptz";
      if (dialect === "mysql") return sql`datetime(3)`;
      return "text";
    },
    /** JSON, stored as text and parsed in repositories. */
    json: (): ColumnType => "text",
    /** Only for Better Auth's `email_verified`. Everywhere else, use a nullable timestamp. */
    boolean: (): ColumnType => (dialect === "sqlite" ? "integer" : "boolean"),
  };
};

/**
 * Table options added to every CREATE TABLE: MySQL tables use utf8mb4, so any text can be stored.
 * Use it as `.$call(tableDefaults(dialect))`.
 */
export const tableDefaults = (dialect: DatabaseDialect) => {
  return <T extends { modifyEnd(modifier: Expression<unknown>): T }>(builder: T): T =>
    dialect === "mysql" ? builder.modifyEnd(sql`default charset = utf8mb4`) : builder;
};
