import { describe, expect, it } from "vitest";
import { parseResetCommand, parseSetupCommand } from "./cli";

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
