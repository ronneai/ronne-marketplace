import type { DatabaseDialect } from "../db/url";

// No runtime imports: the web setup's client code shows these names too.
const PRODUCT_NAMES = {
  sqlite: "SQLite",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
};

/** "SQLite", or the product and version a server reported: "PostgreSQL 15.14", "MariaDB 11.4.2". */
export const describeServer = (check: {
  dialect: DatabaseDialect;
  serverVersion: string;
}): string => {
  if (check.dialect === "sqlite") return PRODUCT_NAMES.sqlite;
  const product =
    check.dialect === "postgres"
      ? "postgres"
      : /mariadb/i.test(check.serverVersion)
        ? "mariadb"
        : "mysql";
  const version = check.serverVersion.replace(/-?mariadb/i, "").trim();
  return `${PRODUCT_NAMES[product]} ${version}`;
};
