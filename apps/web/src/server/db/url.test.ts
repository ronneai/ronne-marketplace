import { describe, expect, it } from "vitest";
import { parseDatabaseUrl, redactDatabaseUrl, UnsupportedDatabaseUrlError } from "./url";

describe("parseDatabaseUrl", () => {
  it("resolves a relative SQLite path against the base directory", () => {
    expect(parseDatabaseUrl("file:./data/ronne.db", "/srv/ronne")).toEqual({
      dialect: "sqlite",
      filename: "/srv/ronne/data/ronne.db",
    });
  });

  it("keeps an absolute SQLite path", () => {
    expect(parseDatabaseUrl("file:/var/lib/ronne/ronne.db", "/srv")).toEqual({
      dialect: "sqlite",
      filename: "/var/lib/ronne/ronne.db",
    });
  });

  it("supports in-memory SQLite", () => {
    expect(parseDatabaseUrl("file::memory:")).toEqual({ dialect: "sqlite", filename: ":memory:" });
  });

  it.each([
    ["mysql://ronne:secret@db:3306/ronne", "mysql"],
    ["postgres://ronne:secret@db:5432/ronne", "postgres"],
    ["postgresql://ronne:secret@db/ronne?sslmode=require", "postgres"],
  ])("recognises %s", (url, dialect) => {
    expect(parseDatabaseUrl(url).dialect).toBe(dialect);
  });

  it.each([
    "",
    "file:",
    "sqlite://data.db",
    "mysql://db:3306",
    "postgres://db:5432/",
    "mongodb://db/ronne",
  ])("rejects %j with the list of supported formats", (url) => {
    expect(() => parseDatabaseUrl(url)).toThrowError(UnsupportedDatabaseUrlError);
    expect(() => parseDatabaseUrl(url)).toThrowError(/postgres:\/\/user:password@host/);
  });

  it("never shows the password in the error", () => {
    expect(() => parseDatabaseUrl("mongodb://ronne:hunter2@db/ronne")).toThrowError(
      /mongodb:\/\/ronne:\*\*\*@db\/ronne/,
    );
    expect(() => parseDatabaseUrl("mongodb://ronne:hunter2@db/ronne")).not.toThrowError(/hunter2/);
  });
});

describe("redactDatabaseUrl", () => {
  it.each([
    ["postgres://ronne:p%40ss:word@db/ronne", "postgres://ronne:***@db/ronne"],
    ["mysql://root:secret@127.0.0.1:3306/ronne", "mysql://root:***@127.0.0.1:3306/ronne"],
    ["postgres://db/ronne", "postgres://db/ronne"],
    ["file:./data/ronne.db", "file:./data/ronne.db"],
  ])("%s → %s", (url, expected) => {
    expect(redactDatabaseUrl(url)).toBe(expected);
  });
});
