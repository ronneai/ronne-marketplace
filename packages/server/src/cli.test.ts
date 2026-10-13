import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_HOST, DEFAULT_PORT, HELP, parseArgs, scriptArgs } from "./cli.js";

describe("rmk-server's arguments (082)", () => {
  it("starts on 127.0.0.1:7650 by default, with or without `start`", () => {
    const start = { kind: "start", port: DEFAULT_PORT, host: DEFAULT_HOST, open: true };
    expect(parseArgs([], {})).toEqual(start);
    expect(parseArgs(["start"], {})).toEqual(start);
    expect(DEFAULT_PORT).toBe(7650);
    expect(DEFAULT_HOST).toBe("127.0.0.1");
  });

  it("takes --port, --host and --no-open, in both flag forms", () => {
    expect(parseArgs(["--port", "8080", "--host", "0.0.0.0", "--no-open"], {})).toEqual({
      kind: "start",
      port: 8080,
      host: "0.0.0.0",
      open: false,
    });
    expect(parseArgs(["start", "--port=7700", "--host=::"], {})).toMatchObject({
      port: 7700,
      host: "::",
    });
  });

  it("reads PORT and HOST, and flags win over them", () => {
    expect(parseArgs([], { PORT: "7000", HOST: "0.0.0.0" })).toMatchObject({
      port: 7000,
      host: "0.0.0.0",
    });
    expect(parseArgs(["--port", "7001"], { PORT: "7000" })).toMatchObject({ port: 7001 });
    expect(parseArgs([], { PORT: "nope" })).toMatchObject({ port: 7650 });
  });

  it("refuses a bad port, a --host without a value and unknown words", () => {
    expect(parseArgs(["--port", "99999"], {})).toMatchObject({
      kind: "error",
      message: expect.stringContaining("1 to 65535"),
    });
    expect(parseArgs(["--port"], {})).toMatchObject({ kind: "error" });
    expect(parseArgs(["--host"], {})).toMatchObject({ kind: "error" });
    expect(parseArgs(["serve"], {})).toMatchObject({
      kind: "error",
      message: expect.stringContaining("serve"),
    });
  });

  it("passes the scripts their own flags untouched", () => {
    expect(parseArgs(["setup", "--yes", "--database-url", "file:x.db"], {})).toEqual({
      kind: "script",
      script: "setup",
      args: ["--yes", "--database-url", "file:x.db"],
      port: 7650,
    });
    expect(parseArgs(["migrate"], { PORT: "7700" })).toMatchObject({
      kind: "script",
      script: "migrate",
      port: 7700,
    });
    expect(parseArgs(["reset-root-password", "--email", "a@b.c"], {})).toMatchObject({
      script: "reset-root-password",
      args: ["--email", "a@b.c"],
    });
    expect(parseArgs(["revoke-access", "--everyone", "--yes"], {})).toMatchObject({
      kind: "script",
      script: "revoke-access",
      args: ["--everyone", "--yes"],
    });
    expect(parseArgs(["rotate-secret", "--yes"], {})).toMatchObject({
      kind: "script",
      script: "rotate-secret",
      args: ["--yes"],
    });
    expect(parseArgs(["backup", "--out", "b", "--keep", "7"], {})).toMatchObject({
      kind: "script",
      script: "backup",
      args: ["--out", "b", "--keep", "7"],
    });
  });

  it("knows --version and --help", () => {
    expect(parseArgs(["--version"], {})).toEqual({ kind: "version" });
    expect(parseArgs(["-v"], {})).toEqual({ kind: "version" });
    expect(parseArgs(["--help"], {})).toEqual({ kind: "help" });
    expect(parseArgs(["help"], {})).toEqual({ kind: "help" });
  });
});

describe("a script's paths (099)", () => {
  const cwd = resolve("/home/alex/ronne");

  it("makes backup's --out absolute from where the command was typed", () => {
    expect(scriptArgs("backup", ["--out", "backups", "--keep", "3"], cwd)).toEqual([
      "--out",
      join(cwd, "backups"),
      "--keep",
      "3",
    ]);
    expect(scriptArgs("backup", ["--out=../b"], cwd)).toEqual([`--out=${resolve(cwd, "../b")}`]);
    const absolute = resolve("/srv/backups");
    expect(scriptArgs("backup", ["--out", absolute], cwd)).toEqual(["--out", absolute]);
  });

  it("leaves everything else as it is", () => {
    // A flag with no value, other scripts' flags, and what follows `--`.
    expect(scriptArgs("backup", ["--out"], cwd)).toEqual(["--out"]);
    // A lone `-` is a folder's name; a blank value stays blank, for the script to refuse.
    expect(scriptArgs("backup", ["--out", "-"], cwd)).toEqual(["--out", join(cwd, "-")]);
    expect(scriptArgs("backup", ["--out", " "], cwd)).toEqual(["--out", " "]);
    expect(scriptArgs("backup", ["--out= "], cwd)).toEqual(["--out= "]);
    // A flag isn't a folder: the script refuses `--out --no-settings` itself.
    expect(scriptArgs("backup", ["--out", "--no-settings"], cwd)).toEqual([
      "--out",
      "--no-settings",
    ]);
    expect(scriptArgs("backup", ["--keep", "out", "--", "--out", "x"], cwd)).toEqual([
      "--keep",
      "out",
      "--",
      "--out",
      "x",
    ]);
    expect(scriptArgs("setup", ["--out", "x", "--yes"], cwd)).toEqual(["--out", "x", "--yes"]);
  });

  it("lists backup in the help", () => {
    expect(HELP).toContain("rmk-server backup [--out DIR] [--no-settings] [--keep N]");
  });
});
