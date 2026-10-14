import type { DatabaseDialect } from "./url";

/**
 * Converts a Date for writing. SQLite has no date type, so it gets ISO-8601 UTC text; MySQL and
 * PostgreSQL drivers take Dates (and every connection is in UTC, see create-db.ts).
 */
export const toDbDate = (date: Date, dialect: DatabaseDialect): Date | string => {
  return dialect === "sqlite" ? date.toISOString() : date;
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * A timestamp as the backup format writes it (099), as a Date, or null when it isn't one exactly:
 * ISO 8601 UTC with 0-3 fraction digits that reads back as the same moment (no February 30, no
 * 24:00), from the year 1 (0000 is ISO 8601 but no year PostgreSQL takes; the app writes none).
 */
export const parseExactTimestamp = (text: string): Date | null => {
  const match = ISO.exec(text);
  if (!match || text.startsWith("0000")) return null;
  const date = new Date(text);
  const exact = `${text.slice(0, 19)}.${(match[1] ?? ".").slice(1).padEnd(3, "0")}Z`;
  return !Number.isNaN(date.getTime()) && date.toISOString() === exact ? date : null;
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
 * Converts a boolean for writing. SQLite drivers can't bind booleans, so it gets 0 or 1. For flags
 * with no moment behind them (email_verified, a file's executable bit); when the moment matters,
 * use a nullable timestamp (MVP §9.4).
 */
export const toDbBoolean = (value: boolean, dialect: DatabaseDialect): boolean | number => {
  return dialect === "sqlite" ? Number(value) : value;
};
