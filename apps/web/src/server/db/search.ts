import { type Expression, type SqlBool, sql } from "kysely";

// `!` rather than a backslash: MySQL reads backslashes in string literals differently from
// PostgreSQL and SQLite, so a backslash escape isn't portable.
const ESCAPE = "!";

/** Escapes `%`, `_` and the escape character itself, so they match literally in LIKE. */
export const escapeLike = (term: string): string => {
  return term.replace(/[!%_]/g, (char) => `${ESCAPE}${char}`);
};

/**
 * `column` contains `term`, ignoring case, with the same result on every dialect (MVP §9.4).
 * Case folding is ASCII-only in SQLite; MySQL and PostgreSQL also fold other letters.
 */
export const containsInsensitive = (column: string, term: string): Expression<SqlBool> => {
  const pattern = `%${escapeLike(term.toLowerCase())}%`;
  return sql<SqlBool>`lower(${sql.ref(column)}) like ${pattern} escape ${sql.lit(ESCAPE)}`;
};
