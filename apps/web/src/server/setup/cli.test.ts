import { describe, expect, it } from "vitest";
import {
  parseResetCommand,
  parseRevokeAccessCommand,
  parseRotateSecretCommand,
  parseSetupCommand,
} from "./cli";

describe("parseSetupCommand", () => {
  it("is interactive in a terminal without --yes", () => {
    expect(parseSetupCommand([], {}, true)).toEqual({ mode: "interactive" });
  });

  it("refuses to wait for answers without a terminal, pointing at --yes", () => {
    expect(parseSetupCommand([], {}, false)).toMatchObject({
      mode: "error",
      exitCode: 2,
      message: expect.stringContaining("--yes"),
    });
  });

  it("is non-interactive with --yes, or on CI without a terminal", () => {
    expect(parseSetupCommand(["--yes"], {}, true).mode).toBe("non-interactive");
    expect(parseSetupCommand([], { CI: "true" }, false).mode).toBe("non-interactive");
    expect(parseSetupCommand([], { CI: "true" }, true).mode).toBe("interactive");
  });

  it("prefers flags over environment variables, and reads the password only from the environment", () => {
    const command = parseSetupCommand(
      ["--yes", "--database-url", "file:./flag.db", "--root-email", "flag@example.com"],
      {
        DATABASE_URL: "file:./env.db",
        RONNE_ROOT_EMAIL: "env@example.com",
        RONNE_ROOT_NAME: "Env",
        RONNE_ROOT_PASSWORD: "from the environment",
      },
      false,
    );
    expect(command).toMatchObject({
      mode: "non-interactive",
      databaseUrl: "file:./flag.db",
      rootEmail: "flag@example.com",
      rootName: "Env",
      rootPassword: "from the environment",
    });
  });

  it("rejects unknown flags, including a password flag", () => {
    expect(parseSetupCommand(["--yes", "--root-password", "x"], {}, false)).toMatchObject({
      mode: "error",
      exitCode: 2,
    });
  });
});

describe("parseResetCommand", () => {
  it("takes the root's email from --email, then RONNE_ROOT_EMAIL (059)", () => {
    expect(parseResetCommand([], {}, true)).toEqual({ mode: "interactive" });
    expect(parseResetCommand(["--email", "a@example.com"], {}, true)).toEqual({
      mode: "interactive",
      rootEmail: "a@example.com",
    });
    expect(
      parseResetCommand(
        ["--yes", "--email", "a@example.com"],
        { RONNE_ROOT_EMAIL: "b@example.com", RONNE_ROOT_PASSWORD: "pw" },
        false,
      ),
    ).toMatchObject({ mode: "non-interactive", rootEmail: "a@example.com", rootPassword: "pw" });
    expect(
      parseResetCommand(["--yes"], { RONNE_ROOT_EMAIL: "b@example.com" }, false),
    ).toMatchObject({ rootEmail: "b@example.com" });
  });

  it("rejects unknown flags", () => {
    expect(parseResetCommand(["--root", "x"], {}, true)).toMatchObject({
      mode: "error",
      exitCode: 2,
    });
  });
});

describe("parseRevokeAccessCommand (098)", () => {
  const both = { sessions: true, tokens: true };

  it("takes --everyone or --user, asking in a terminal and not with --yes", () => {
    expect(parseRevokeAccessCommand(["--everyone"], {}, true)).toEqual({
      mode: "interactive",
      target: { kind: "everyone" },
      kinds: both,
    });
    expect(
      parseRevokeAccessCommand(
        ["--user", "a@example.com", "--yes"],
        { DATABASE_URL: "file:x" },
        false,
      ),
    ).toEqual({
      mode: "non-interactive",
      target: { kind: "user", email: "a@example.com" },
      kinds: both,
      databaseUrl: "file:x",
    });
  });

  it("--sessions-only and --tokens-only do half, never both", () => {
    expect(
      parseRevokeAccessCommand(["--everyone", "--sessions-only", "-y"], {}, false),
    ).toMatchObject({ kinds: { sessions: true, tokens: false } });
    expect(
      parseRevokeAccessCommand(["--everyone", "--tokens-only", "-y"], {}, false),
    ).toMatchObject({
      kinds: { sessions: false, tokens: true },
    });
    expect(
      parseRevokeAccessCommand(["--everyone", "--sessions-only", "--tokens-only"], {}, true),
    ).toMatchObject({ mode: "error", exitCode: 2 });
  });

  it("needs exactly one of --everyone and --user", () => {
    for (const argv of [[], ["--yes"], ["--everyone", "--user", "a@example.com"]])
      expect(parseRevokeAccessCommand(argv, {}, true), argv.join(" ")).toMatchObject({
        mode: "error",
        exitCode: 2,
        message: expect.stringContaining("--everyone"),
      });
  });

  it("--help asks for the usage, whatever else is given", () => {
    expect(parseRevokeAccessCommand(["--help"], {}, false)).toEqual({ mode: "help" });
    expect(parseRevokeAccessCommand(["--everyone", "-h"], {}, true)).toEqual({ mode: "help" });
  });

  it("refuses unknown flags, and to wait for an answer without a terminal", () => {
    expect(parseRevokeAccessCommand(["--everyone", "--all"], {}, true)).toMatchObject({
      mode: "error",
      exitCode: 2,
    });
    expect(parseRevokeAccessCommand(["--everyone"], {}, false)).toMatchObject({
      mode: "error",
      message: expect.stringContaining("--yes"),
    });
  });
});

describe("parseRotateSecretCommand (098)", () => {
  it("asks in a terminal, not with --yes, and refuses to wait without a terminal", () => {
    expect(parseRotateSecretCommand([], true)).toEqual({ mode: "interactive" });
    expect(parseRotateSecretCommand(["--yes"], false)).toEqual({ mode: "non-interactive" });
    expect(parseRotateSecretCommand(["-y"], false)).toEqual({ mode: "non-interactive" });
    expect(parseRotateSecretCommand([], false)).toMatchObject({
      mode: "error",
      exitCode: 2,
      message: expect.stringContaining("--yes"),
    });
  });

  it("--help asks for the usage; unknown flags and values are refused", () => {
    expect(parseRotateSecretCommand(["--help"], false)).toEqual({ mode: "help" });
    expect(parseRotateSecretCommand(["--yes", "-h"], true)).toEqual({ mode: "help" });
    for (const argv of [["--force"], ["new-secret"], ["--yes=1"]])
      expect(parseRotateSecretCommand(argv, true), argv.join(" ")).toMatchObject({
        mode: "error",
        exitCode: 2,
      });
  });
});
