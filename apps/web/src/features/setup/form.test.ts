import { describe, expect, it } from "vitest";
import { readDatabaseAnswers, readRootInput, readValues } from "./form";
import { DEFAULT_VALUES } from "./types";

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

describe("readDatabaseAnswers", () => {
  it("reads a SQLite path, trimmed", () => {
    expect(
      readDatabaseAnswers(form({ "database.kind": "sqlite", "database.path": " ./data/x.db " })),
    ).toEqual({
      ok: true,
      answers: { dialect: "sqlite", path: "./data/x.db" },
    });
    expect(
      readDatabaseAnswers(form({ "database.kind": "sqlite", "database.path": " " })),
    ).toMatchObject({
      ok: false,
      error: { field: "database.path" },
    });
  });

  it("reads a server, with the default port and the password as typed", () => {
    expect(
      readDatabaseAnswers(
        form({
          "database.kind": "postgres",
          "database.host": "db ",
          "database.name": "ronne",
          "database.user": "ronne",
          "database.password": " p@ss ",
        }),
      ),
    ).toEqual({
      ok: true,
      answers: {
        dialect: "postgres",
        host: "db",
        port: "5432",
        database: "ronne",
        user: "ronne",
        password: " p@ss ",
      },
    });
  });

  it("names the first missing or invalid server field", () => {
    const base = {
      "database.kind": "mysql",
      "database.host": "db",
      "database.name": "ronne",
      "database.user": "u",
    };
    expect(readDatabaseAnswers(form({ ...base, "database.host": "" }))).toMatchObject({
      error: { field: "database.host" },
    });
    expect(readDatabaseAnswers(form({ ...base, "database.port": "abc" }))).toMatchObject({
      error: { field: "database.port", message: "Enter a port number." },
    });
    expect(readDatabaseAnswers(form({ ...base, "database.user": "" }))).toMatchObject({
      error: { field: "database.user" },
    });
  });

  it("treats an unknown kind as SQLite", () => {
    expect(
      readDatabaseAnswers(form({ "database.kind": "oracle", "database.path": "a.db" })),
    ).toMatchObject({
      answers: { dialect: "sqlite" },
    });
  });
});

describe("readValues and readRootInput", () => {
  it("keeps the non-secret answers and falls back to the defaults", () => {
    const values = readValues(
      form({
        "database.kind": "mysql",
        "database.user": "ronne",
        "root.email": " R@x.test ",
        "database.keep": "on",
      }),
    );
    expect(values).toEqual({
      ...DEFAULT_VALUES,
      kind: "mysql",
      user: "ronne",
      keep: true,
      rootEmail: "R@x.test",
    });
    expect(JSON.stringify(values)).not.toContain("password");
  });

  it("reads the root answers with the passwords untouched", () => {
    expect(
      readRootInput(
        form({
          "root.email": " root@x.test ",
          "root.name": " Root ",
          "root.password": " a b ",
          "root.password_again": " a b",
        }),
      ),
    ).toEqual({ email: "root@x.test", name: "Root", password: " a b ", again: " a b" });
  });
});
