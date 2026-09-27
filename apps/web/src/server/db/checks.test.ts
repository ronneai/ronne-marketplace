import { describe, expect, it } from "vitest";
import { checkServerVersion, classifyConnectionError } from "./checks";
import { UnsupportedDatabaseUrlError } from "./url";

const withCode = (code: string, message = "") => Object.assign(new Error(message), { code });

describe("classifyConnectionError", () => {
  it.each([
    ["a malformed URL", new UnsupportedDatabaseUrlError("nope://"), "invalid_url"],
    ["a refused connection", withCode("ECONNREFUSED"), "unreachable"],
    ["an unknown host", withCode("ENOTFOUND"), "unreachable"],
    ["a timeout", new Error("Connection terminated due to connection timeout"), "unreachable"],
    [
      "pg's AggregateError",
      Object.assign(new AggregateError([withCode("ECONNREFUSED")]), {
        errors: [withCode("ECONNREFUSED")],
      }),
      "unreachable",
    ],
    ["a SQLite folder it can't create", withCode("EACCES"), "unreachable"],
    ["PostgreSQL wrong password", withCode("28P01"), "auth_failed"],
    ["MySQL/MariaDB wrong password", withCode("ER_ACCESS_DENIED_ERROR"), "auth_failed"],
    [
      "MySQL user without access to the database",
      withCode("ER_DBACCESS_DENIED_ERROR"),
      "auth_failed",
    ],
    ["PostgreSQL missing database", withCode("3D000"), "database_missing"],
    ["MySQL/MariaDB missing database", withCode("ER_BAD_DB_ERROR"), "database_missing"],
    ["anything else", new Error("something odd"), "unknown"],
  ])("%s → %s", (_label, error, expected) => {
    expect(classifyConnectionError(error)).toBe(expected);
  });
});

describe("checkServerVersion", () => {
  it.each([
    ["postgres", "18.6 (Debian 18.6-1.pgdg13+2)", true],
    ["postgres", "15.19 (Debian 15.19-1.pgdg13+2)", true],
    ["postgres", "14.12", false],
    ["mysql", "8.4.11", true],
    ["mysql", "9.1.0", true],
    ["mysql", "8.0.39", false],
    ["mysql", "10.11.19-MariaDB-ubu2204", true],
    ["mysql", "11.4.2-MariaDB", true],
    ["mysql", "10.6.18-MariaDB", false],
    ["sqlite", "3.45.0", true],
  ] as const)("%s %s → supported: %s", (dialect, version, supported) => {
    expect(checkServerVersion(dialect, version).supported).toBe(supported);
  });

  it("names the product and the minimum when it's too old", () => {
    expect(checkServerVersion("mysql", "10.6.18-MariaDB")).toEqual({
      supported: false,
      product: "MariaDB",
      minimum: "10.11",
    });
    expect(checkServerVersion("postgres", "14.12")).toEqual({
      supported: false,
      product: "PostgreSQL",
      minimum: "15",
    });
  });
});
