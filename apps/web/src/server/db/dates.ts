import type { DatabaseDialect } from "./url";

/**
 * Converts a Date for writing. SQLite has no date type, so it gets ISO-8601 UTC text; MySQL and
 * PostgreSQL drivers take Dates (and every connection is in UTC, see create-db.ts).
 */
export const toDbDate = (date: Date, dialect: DatabaseDialect): Date | string => {
  return dialect === "sqlite" ? date.toISOString() : date;
};

/** Reads a timestamp column from any dialect as a Date. */
type FromDbDate = {
  (value: Date | string): Date;
  (value: Date | string | null): Date | null;
};

// An arrow can't carry overloads itself, so it's typed by the call signatures above.
export const fromDbDate = ((value: Date | string | null): Date | null => {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Not a valid timestamp: ${String(value)}`);
  return date;
}) as FromDbDate;

/**
 * Converts a boolean for writing. SQLite drivers can't bind booleans, so it gets 0 or 1. Only for
 * Better Auth's email_verified: everywhere else, use a nullable timestamp (MVP §9.4).
 */
export const toDbBoolean = (value: boolean, dialect: DatabaseDialect): boolean | number => {
  return dialect === "sqlite" ? Number(value) : value;
};
