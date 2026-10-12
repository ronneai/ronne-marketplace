import { parseArgs } from "node:util";
import { scriptCommand } from "../runtime";

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
export const parseSetupCommand = (argv: string[], env: Env, hasTerminal: boolean): SetupCommand => {
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
        message: `There's no terminal to ask questions in. Run \`${scriptCommand("setup", env)} --yes\` with the values in flags or environment variables.`,
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
};

export type ResetCommand =
  | { mode: "interactive"; rootEmail?: string }
  | { mode: "non-interactive"; rootEmail?: string; rootPassword?: string; databaseUrl?: string }
  | { mode: "error"; exitCode: 2; message: string };

/**
 * reset-root-password's flags: --yes, and --email (or RONNE_ROOT_EMAIL) to say which root when
 * there are several (059). The new password comes from RONNE_ROOT_PASSWORD.
 */
export const parseResetCommand = (argv: string[], env: Env, hasTerminal: boolean): ResetCommand => {
  let yes = false;
  let rootEmail: string | undefined;
  try {
    const { values } = parseArgs({
      args: argv,
      strict: true,
      options: { yes: { type: "boolean", short: "y" }, email: { type: "string" } },
    });
    yes = values.yes === true;
    rootEmail = values.email || env.RONNE_ROOT_EMAIL || undefined;
  } catch (error) {
    return { mode: "error", exitCode: 2, message: (error as Error).message };
  }
  if (yes || (env.CI === "true" && !hasTerminal)) {
    return {
      mode: "non-interactive",
      rootEmail,
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
  return { mode: "interactive", rootEmail };
};

export type RevokeAccessCommand =
  | {
      mode: "interactive" | "non-interactive";
      target: { kind: "everyone" } | { kind: "user"; email: string };
      kinds: { sessions: boolean; tokens: boolean };
      databaseUrl?: string;
    }
  | { mode: "help" }
  | { mode: "error"; exitCode: 2; message: string };

export const REVOKE_ACCESS_USAGE = `Usage: revoke-access --everyone | --user EMAIL [--sessions-only | --tokens-only] [--yes]

Ends sessions and revokes access tokens, for every account (root's included) or one person, for
incidents. Nobody is disabled and no password changes: people sign in again and make new tokens.

  --everyone       Every account on this instance
  --user EMAIL     Only this person
  --sessions-only  End sessions; keep access tokens
  --tokens-only    Revoke access tokens; keep sessions
  --yes, -y        Don't ask first (needed without a terminal)
  --help, -h       Show this`;

/**
 * revoke-access's flags (098): exactly one of --everyone and --user <email>; --sessions-only or
 * --tokens-only for half; --yes to skip the question (needed without a terminal).
 */
export const parseRevokeAccessCommand = (
  argv: string[],
  env: Env,
  hasTerminal: boolean,
): RevokeAccessCommand => {
  const error = (message: string) => ({ mode: "error", exitCode: 2, message }) as const;
  let values: {
    everyone?: boolean;
    user?: string;
    "sessions-only"?: boolean;
    "tokens-only"?: boolean;
    yes?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        everyone: { type: "boolean" },
        user: { type: "string" },
        "sessions-only": { type: "boolean" },
        "tokens-only": { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (caught) {
    return error((caught as Error).message);
  }
  if (values.help) return { mode: "help" };
  if ((values.everyone === true) === (values.user !== undefined))
    return error("Say whose access to revoke: --everyone, or --user <email>.");
  if (values["sessions-only"] && values["tokens-only"])
    return error("--sessions-only and --tokens-only can't be used together.");
  const target =
    values.user !== undefined
      ? ({ kind: "user", email: values.user } as const)
      : ({ kind: "everyone" } as const);
  const kinds = {
    sessions: !values["tokens-only"],
    tokens: !values["sessions-only"],
  };
  if (values.yes) return { mode: "non-interactive", target, kinds, databaseUrl: env.DATABASE_URL };
  if (!hasTerminal) return error("There's no terminal to ask for confirmation. Run it with --yes.");
  return { mode: "interactive", target, kinds, databaseUrl: env.DATABASE_URL };
};
