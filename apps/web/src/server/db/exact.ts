import { type Expression, type SqlBool, sql } from "kysely";
import type { DatabaseDialect } from "./url";

/**
 * `column = value`, byte for byte (136). MySQL and MariaDB compare `text` by its collation, which
 * ignores case, so `v1.AAAA` would equal `v1.aaaa` there; SQLite and PostgreSQL already compare
 * exactly. For values that must match exactly, such as a compare-and-set on a sealed secret.
 */
export const exactEquals = (
  dialect: DatabaseDialect,
  column: string,
  value: string,
): Expression<SqlBool> =>
  dialect === "mysql"
    ? sql<SqlBool>`binary ${sql.ref(column)} = ${value}`
    : sql<SqlBool>`${sql.ref(column)} = ${value}`;
