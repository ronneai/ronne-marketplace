import type { DatabaseDialect } from "./url";

/**
 * Converts a Date for writing. SQLite has no date type, so it gets ISO-8601 UTC text; MySQL and
 * PostgreSQL drivers take Dates (and every connection is in UTC, see create-db.ts).
 */
export function toDbDate(date: Date, dialect: DatabaseDialect): Date | string {
  return dialect === "sqlite" ? date.toISOString() : date;
}

/** Reads a timestamp column from any dialect as a Date. */
export function fromDbDate(value: Date | string): Date;
export function fromDbDate(value: Date | string | null): Date | null;
export function fromDbDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Not a valid timestamp: ${String(value)}`);
  return date;
}
