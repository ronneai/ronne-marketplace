import { describe, expect, it } from "vitest";
import { parseSetupCommand } from "./cli";

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
