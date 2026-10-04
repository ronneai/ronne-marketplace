import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  type ConnectionFailure,
  checkCharset,
  checkConnection,
  checkPermissions,
  checkServerVersion,
} from "../db/checks";
import { createDb } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import type { DatabaseDialect } from "../db/url";
import { createRoot, listRoots } from "../domains/identity/actions/root-account";
import type { RootAccount } from "../domains/identity/models/user";
import type { NewRoot, RootOrigin } from "../domains/identity/services/root-account";
import { defaultDataPath } from "../runtime";
import { generateAuthSecret, isWeakSecret, readEnvFile, updateEnvFile } from "./env-file";
import { describeServer } from "./server-name";

export { describeServer } from "./server-name";

/**
 * The steps of setting an instance up (MVP §5, features 003 and 036), with no prompts and no
 * logging: the terminal (`run-setup.ts`) and the web setup (`features/setup`) both call them, so
 * they check, write and say the same things. Each step opens and closes its own connection,
 * never the app's cached pool: a database the person may still replace must not stay cached.
 */

export type StepOptions = {
  /** apps/web: SQLite paths and STORAGE_PATH are relative to it. */
  appDir: string;
};

export type DatabaseProblem = {
  kind: ConnectionFailure | "charset" | "permissions";
  /** In plain words, what's wrong and what to do. */
  explanation: string;
  /** The driver's message, or the statement that fixes it. */
  detail?: string;
};

export type DatabaseCheck =
  | { ok: true; dialect: DatabaseDialect; serverVersion: string; warning?: string }
  | { ok: false; problem: DatabaseProblem };

export const FAILURE_EXPLANATIONS: Record<ConnectionFailure, string> = {
  invalid_url: "The connection details don't form a valid database URL.",
  unreachable:
    "Couldn't reach the database server. Check the host and port, and that the server is running.",
  auth_failed: "The server refused the user name or password.",
  database_missing:
    "The server has no database with that name. Create it first; setup doesn't create databases.",
  unknown: "The connection failed.",
};

/** The problem as one message: the explanation, then the detail on its own line. */
export const formatProblem = (problem: DatabaseProblem): string => {
  return problem.detail ? `${problem.explanation}\n${problem.detail}` : problem.explanation;
};

/**
 * Checks that the database can be used: connection, server version (a warning, not a failure),
 * utf8mb4 on MySQL, and the permissions to create, write, read and drop tables (through a probe
 * table that's dropped again). Never throws for a bad database.
 */
export const checkDatabase = async (url: string, options: StepOptions): Promise<DatabaseCheck> => {
  const connection = await checkConnection(url, { baseDir: options.appDir });
  if (!connection.ok) {
    return {
      ok: false,
      problem: {
        kind: connection.kind,
        explanation: FAILURE_EXPLANATIONS[connection.kind],
        detail: connection.message,
      },
    };
  }

  const version = checkServerVersion(connection.dialect, connection.serverVersion);
  const warning = version.supported
    ? undefined
    : `${describeServer(connection)} is older than the minimum Ronne AI Marketplace supports (${version.minimum}). Setup continues, but it isn't tested.`;

  const { db, dialect } = createDb(url, { baseDir: options.appDir });
  try {
    const charset = await checkCharset(db, dialect);
    if (!charset.ok) {
      return {
        ok: false,
        problem: {
          kind: "charset",
          explanation: `The database uses the ${charset.charset} character set; Ronne AI Marketplace needs utf8mb4.`,
          detail: "Run: ALTER DATABASE <name> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        },
      };
    }
    const permissions = await checkPermissions(db, dialect);
    if (!permissions.ok) {
      return {
        ok: false,
        problem: {
          kind: "permissions",
          explanation: `The database user can't ${permissions.step} tables: ${permissions.message}`,
          detail:
            dialect === "postgres"
              ? "On PostgreSQL 15 and later, grant it with: GRANT CREATE ON SCHEMA public TO <user>; (or make the user the database owner)."
              : undefined,
        },
      };
    }
  } finally {
    await db.destroy();
  }
  return { ok: true, dialect, serverVersion: connection.serverVersion, warning };
};

export type WriteSettingsOptions = StepOptions & {
  /** The settings file to write. */
  envPath: string;
  databaseUrl: string;
  publicUrl: string;
  /** STORAGE_PATH; the one already in the file, or ./data/storage, when not given. */
  storagePath?: string;
  /** The process environment, whose values win over the file (`loadConfig`). */
  env?: Record<string, string | undefined>;
};

export type WrittenSettings = {
  envPath: string;
  storagePath: string;
  /** An AUTH_SECRET shorter than 32 characters was found and kept. */
  weakSecret: boolean;
  /**
   * The process environment still holds a DATABASE_URL or PUBLIC_URL that differs from what was
   * written, so this process won't see the new values until it's restarted.
   */
  restartNeeded: boolean;
};

/**
 * Writes DATABASE_URL, AUTH_SECRET (a new one, unless the file has one: replacing it would sign
 * everyone out), STORAGE_PATH and PUBLIC_URL, keeping every other line, with mode 0600; and
 * creates the storage folder.
 */
export const writeSettings = (options: WriteSettingsOptions): WrittenSettings => {
  const env = options.env ?? process.env;
  const existing = readEnvFile(options.envPath);
  const storagePath =
    options.storagePath || existing.STORAGE_PATH || defaultDataPath("storage", env);
  const written = updateEnvFile(options.envPath, {
    DATABASE_URL: options.databaseUrl,
    AUTH_SECRET: existing.AUTH_SECRET || generateAuthSecret(),
    STORAGE_PATH: storagePath,
    PUBLIC_URL: options.publicUrl,
  });
  mkdirSync(isAbsolute(storagePath) ? storagePath : resolve(options.appDir, storagePath), {
    recursive: true,
  });
  const shadowed = (key: "DATABASE_URL" | "PUBLIC_URL", value: string) =>
    Boolean(env[key]) && env[key] !== value;
  return {
    envPath: options.envPath,
    storagePath,
    weakSecret: Boolean(written.AUTH_SECRET && isWeakSecret(written.AUTH_SECRET)),
    restartNeeded:
      shadowed("DATABASE_URL", options.databaseUrl) || shadowed("PUBLIC_URL", options.publicUrl),
  };
};

/**
 * Applies the pending migrations and returns their names (none when the database is up to date).
 * A database migrated by a newer version throws `DatabaseAheadOfAppError`.
 */
export const applyMigrations = async (
  url: string,
  options: StepOptions,
): Promise<{ applied: string[] }> => {
  const { db, dialect } = createDb(url, { baseDir: options.appDir });
  try {
    return { applied: await migrateToLatest(db, dialect) };
  } finally {
    await db.destroy();
  }
};

/** The root accounts, oldest first: none before setup, and possibly several since 059. */
export const listRootAccounts = async (
  url: string,
  options: StepOptions,
): Promise<RootAccount[]> => {
  const { db, dialect } = createDb(url, { baseDir: options.appDir });
  try {
    return await listRoots(db, dialect);
  } finally {
    await db.destroy();
  }
};

/**
 * Creates the first root account, recording where it was created from. Throws the identity
 * domain's errors: invalid input, or `RootAlreadyExistsError`.
 */
export const createRootAccount = async (
  url: string,
  options: StepOptions,
  input: NewRoot,
  origin: RootOrigin,
): Promise<{ id: string; email: string }> => {
  const { db, dialect } = createDb(url, { baseDir: options.appDir });
  try {
    return await createRoot(db, dialect, input, origin);
  } finally {
    await db.destroy();
  }
};
