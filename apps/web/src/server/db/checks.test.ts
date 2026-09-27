import { describe, expect, it } from "vitest";
import { classifyConnectionError } from "./checks";
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
