import { parseArgs } from "node:util";

export type SetupCommand =
  | { mode: "interactive" }
  | {
      mode: "non-interactive";
      databaseUrl?: string;
      publicUrl?: string;
      storagePath?: string;
      rootEmail?: string;
      rootName?: string;
      rootPassword?: string;
    }
  | { mode: "error"; exitCode: 2; message: string };

type Env = Record<string, string | undefined>;

/**
 * Reads setup's flags and environment. Non-interactive with --yes, or when CI=true and there's no
 * terminal. The root password is only read from RONNE_ROOT_PASSWORD, never a flag, to keep it out
 * of shell history.
 */
export function parseSetupCommand(argv: string[], env: Env, hasTerminal: boolean): SetupCommand {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        yes: { type: "boolean", short: "y" },
        "database-url": { type: "string" },
        "public-url": { type: "string" },
        "storage-path": { type: "string" },
        "root-email": { type: "string" },
        "root-name": { type: "string" },
      },
    }));
  } catch (error) {
    return { mode: "error", exitCode: 2, message: (error as Error).message };
  }

  const nonInteractive = values.yes === true || (env.CI === "true" && !hasTerminal);
  if (!nonInteractive) {
    if (!hasTerminal) {
      return {
        mode: "error",
        exitCode: 2,
        message:
          "There's no terminal to ask questions in. Run `pnpm run setup --yes` with the values in flags or environment variables.",
      };
    }
    return { mode: "interactive" };
  }

  const pick = (flag: string, variable: string) =>
    (values[flag] as string | undefined) ?? env[variable] ?? undefined;
  return {
    mode: "non-interactive",
    databaseUrl: pick("database-url", "DATABASE_URL"),
    publicUrl: pick("public-url", "PUBLIC_URL"),
    storagePath: pick("storage-path", "STORAGE_PATH"),
    rootEmail: pick("root-email", "RONNE_ROOT_EMAIL"),
    rootName: pick("root-name", "RONNE_ROOT_NAME"),
    rootPassword: env.RONNE_ROOT_PASSWORD,
  };
}

export type ResetCommand =
  | { mode: "interactive" }
  | { mode: "non-interactive"; rootPassword?: string; databaseUrl?: string }
  | { mode: "error"; exitCode: 2; message: string };

/** reset-root-password's flags: only --yes. The new password comes from RONNE_ROOT_PASSWORD. */
export function parseResetCommand(argv: string[], env: Env, hasTerminal: boolean): ResetCommand {
  let yes = false;
  try {
    yes =
      parseArgs({ args: argv, strict: true, options: { yes: { type: "boolean", short: "y" } } })
        .values.yes === true;
  } catch (error) {
    return { mode: "error", exitCode: 2, message: (error as Error).message };
  }
  if (yes || (env.CI === "true" && !hasTerminal)) {
    return {
      mode: "non-interactive",
      rootPassword: env.RONNE_ROOT_PASSWORD,
      databaseUrl: env.DATABASE_URL,
    };
  }
  if (!hasTerminal) {
    return {
      mode: "error",
      exitCode: 2,
      message:
        "There's no terminal to ask for the password. Run it with --yes and RONNE_ROOT_PASSWORD set.",
    };
  }
  return { mode: "interactive" };
}
