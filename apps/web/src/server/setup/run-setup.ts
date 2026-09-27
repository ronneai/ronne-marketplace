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
import { DatabaseAheadOfAppError, migrateToLatest } from "../db/migrate";
import { type DatabaseDialect, redactDatabaseUrl } from "../db/url";
import { createRoot, findRoot } from "../domains/identity/actions/root-account";
import { IdentityError } from "../domains/identity/exceptions/errors";
import { validatePassword } from "../domains/identity/models/password";
import { normalizeEmail, normalizeName } from "../domains/identity/models/user";
import {
  buildDatabaseUrl,
  type DatabaseAnswers,
  DEFAULT_PORTS,
  DEFAULT_SQLITE_PATH,
} from "./database-url";
import { generateAuthSecret, isWeakSecret, readEnvFile, updateEnvFile } from "./env-file";
import type { SetupPrompts } from "./prompts";

export type SetupOptions = {
  /** apps/web: SQLite paths and STORAGE_PATH are relative to it. */
  appDir: string;
  /** The .env file to read and write. */
  envPath: string;
  prompts: SetupPrompts;
  /** Use this DATABASE_URL instead of asking (non-interactive mode's --database-url). */
  databaseUrl?: string;
  /** Use this STORAGE_PATH instead of the one in .env or the default. */
  storagePath?: string;
};

export type SetupResult = { publicUrl: string; rootEmail: string; rootCreated: boolean };

/** Setup stopped at a check that can't be retried (non-interactive mode, or a newer database). */
export class SetupFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupFailedError";
  }
}

const FAILURE_EXPLANATIONS: Record<ConnectionFailure, string> = {
  invalid_url: "The connection details don't form a valid database URL.",
  unreachable:
    "Couldn't reach the database server. Check the host and port, and that the server is running.",
  auth_failed: "The server refused the user name or password.",
  database_missing:
    "The server has no database with that name. Create it first; setup doesn't create databases.",
  unknown: "The connection failed.",
};

const wrap = (validate: (value: string) => unknown) => (value: string) => {
  try {
    validate(value);
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
};

/** The interactive (or scripted) setup from MVP §5 and feature 003. Each step is safe to repeat. */
export async function runSetup(options: SetupOptions): Promise<SetupResult> {
  const { appDir, envPath, prompts } = options;
  const env = readEnvFile(envPath);

  // 1–4. Database: reuse the one in .env, or ask, then validate until it passes.
  let databaseUrl: string | undefined = options.databaseUrl;
  if (!databaseUrl && env.DATABASE_URL) {
    const reuse = await prompts.confirm({
      id: "database.reuse",
      message: `Use the database already in .env (${redactDatabaseUrl(env.DATABASE_URL)})?`,
      initial: true,
    });
    if (reuse) databaseUrl = env.DATABASE_URL;
    else
      prompts.log.warn(
        "Starting over. The database in the old .env is left as it is, and isn't migrated.",
      );
  }

  let dialect: DatabaseDialect;
  let answers: DatabaseAnswers | undefined;
  for (;;) {
    if (!databaseUrl) {
      answers = await askDatabase(prompts, answers);
      databaseUrl = buildDatabaseUrl(answers);
    }
    const problem = await validateDatabase(databaseUrl, appDir, prompts);
    if (!problem) {
      dialect = createDb(databaseUrl, { baseDir: appDir }).dialect;
      break;
    }
    prompts.log.error(problem);
    if (!prompts.interactive) throw new SetupFailedError(problem);
    databaseUrl = undefined;
  }

  // 5. Public URL.
  const publicUrl = (
    await prompts.text({
      id: "public_url",
      message: "Where will people open Ronne (PUBLIC_URL)?",
      initial: env.PUBLIC_URL || "http://localhost:3000",
      validate: (value) =>
        /^https?:\/\/[^\s/]+/.test(value.trim())
          ? undefined
          : "Use an http:// or https:// address.",
    })
  )
    .trim()
    .replace(/\/+$/, "");

  // 6. .env. An existing AUTH_SECRET is always kept: a new one would sign everyone out.
  const storagePath = options.storagePath || env.STORAGE_PATH || "./data/storage";
  const written = updateEnvFile(envPath, {
    DATABASE_URL: databaseUrl,
    AUTH_SECRET: env.AUTH_SECRET || generateAuthSecret(),
    STORAGE_PATH: storagePath,
    PUBLIC_URL: publicUrl,
  });
  mkdirSync(isAbsolute(storagePath) ? storagePath : resolve(appDir, storagePath), {
    recursive: true,
  });
  if (written.AUTH_SECRET && isWeakSecret(written.AUTH_SECRET)) {
    prompts.log.warn(
      "The AUTH_SECRET in .env is shorter than 32 characters. It's kept, but consider replacing it.",
    );
  }
  prompts.log.success(`Saved ${envPath} (readable only by you).`);

  // 7. Migrations.
  const { db } = createDb(databaseUrl, { baseDir: appDir });
  try {
    try {
      const applied = await migrateToLatest(db, dialect);
      prompts.log.success(
        applied.length === 0
          ? "The database is up to date."
          : `Applied migrations: ${applied.join(", ")}.`,
      );
    } catch (error) {
      if (error instanceof DatabaseAheadOfAppError) throw new SetupFailedError(error.message);
      throw error;
    }

    // 8. Root account.
    const existing = await findRoot(db, dialect);
    if (existing) {
      prompts.log.info(
        `A root account already exists (${existing.email}). Setup doesn't create another.`,
      );
      if (existing.disabledAt) {
        prompts.log.warn(
          "That root account is disabled. Run `pnpm run reset-root-password` to enable it again.",
        );
      }
      return { publicUrl, rootEmail: existing.email, rootCreated: false };
    }

    prompts.log.step(
      "Create the root account: it can do everything, including managing other users.",
    );
    const email = await prompts.text({
      id: "root.email",
      message: "Root email",
      validate: wrap(normalizeEmail),
    });
    const name = await prompts.text({
      id: "root.name",
      message: "Display name",
      validate: wrap(normalizeName),
    });
    let password: string;
    for (;;) {
      password = await prompts.password({
        id: "root.password",
        message: "Password (12 to 128 characters)",
        validate: wrap(validatePassword),
      });
      const again = await prompts.password({
        id: "root.password_again",
        message: "Type the password again",
      });
      if (again === password) break;
      prompts.log.error("The two passwords don't match.");
      if (!prompts.interactive) throw new SetupFailedError("The two passwords don't match.");
    }

    try {
      const root = await createRoot(db, dialect, { email, name, password });
      prompts.log.success(`Created the root account ${root.email}.`);
      return { publicUrl, rootEmail: root.email, rootCreated: true };
    } catch (error) {
      if (error instanceof IdentityError) throw new SetupFailedError(error.message);
      throw error;
    }
  } finally {
    await db.destroy();
  }
}

async function askDatabase(
  prompts: SetupPrompts,
  previous?: DatabaseAnswers,
): Promise<DatabaseAnswers> {
  const dialect = await prompts.select({
    id: "database.kind",
    message: "Which database should Ronne use?",
    initial: previous?.dialect ?? "sqlite",
    choices: [
      {
        value: "sqlite",
        label: "SQLite",
        hint: "default: a file on this machine, nothing else to install",
      },
      {
        value: "mysql",
        label: "MySQL or MariaDB",
        hint: "MySQL 8.4+ or MariaDB 10.11+, already running",
      },
      { value: "postgres", label: "PostgreSQL", hint: "PostgreSQL 15+, already running" },
    ],
  });

  if (dialect === "sqlite") {
    const path = await prompts.text({
      id: "database.path",
      message: "Where should the SQLite file go?",
      initial: previous?.dialect === "sqlite" ? previous.path : DEFAULT_SQLITE_PATH,
      validate: (value) => (value.trim() ? undefined : "Enter a file path."),
    });
    return { dialect, path: path.trim() };
  }

  const before = previous && previous.dialect === dialect ? previous : undefined;
  const required = (label: string) => (value: string) =>
    value.trim() ? undefined : `Enter the ${label}.`;
  const host = await prompts.text({
    id: "database.host",
    message: "Host",
    initial: before?.host ?? "localhost",
    validate: required("host"),
  });
  const port = await prompts.text({
    id: "database.port",
    message: "Port",
    initial: before?.port ?? DEFAULT_PORTS[dialect],
    validate: (value) => (/^\d{1,5}$/.test(value.trim()) ? undefined : "Enter a port number."),
  });
  const database = await prompts.text({
    id: "database.name",
    message: "Database name",
    initial: before?.database ?? "ronne",
    validate: required("database name"),
  });
  const user = await prompts.text({
    id: "database.user",
    message: "User",
    initial: before?.user,
    validate: required("user"),
  });
  const password = await prompts.password({ id: "database.password", message: "Password" });
  return {
    dialect,
    host: host.trim(),
    port: port.trim(),
    database: database.trim(),
    user: user.trim(),
    password,
  };
}

/** Returns a message describing what's wrong, or undefined when the database is ready to use. */
async function validateDatabase(
  url: string,
  appDir: string,
  prompts: SetupPrompts,
): Promise<string | undefined> {
  const connection = await checkConnection(url, { baseDir: appDir });
  if (!connection.ok) return `${FAILURE_EXPLANATIONS[connection.kind]}\n${connection.message}`;

  const version = checkServerVersion(connection.dialect, connection.serverVersion);
  if (!version.supported) {
    prompts.log.warn(
      `${version.product} ${connection.serverVersion} is older than the minimum Ronne supports (${version.minimum}). Setup continues, but it isn't tested.`,
    );
  }

  const { db, dialect } = createDb(url, { baseDir: appDir });
  try {
    const charset = await checkCharset(db, dialect);
    if (!charset.ok) {
      return `The database uses the ${charset.charset} character set; Ronne needs utf8mb4.\nRun: ALTER DATABASE <name> CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;
    }
    const permissions = await checkPermissions(db, dialect);
    if (!permissions.ok) {
      const hint =
        dialect === "postgres"
          ? "\nOn PostgreSQL 15 and later, grant it with: GRANT CREATE ON SCHEMA public TO <user>; (or make the user the database owner)."
          : "";
      return `The database user can't ${permissions.step} tables: ${permissions.message}${hint}`;
    }
  } finally {
    await db.destroy();
  }
  prompts.log.success(
    `Connected to ${dialect === "sqlite" ? "SQLite" : connection.serverVersion} and checked permissions.`,
  );
  return undefined;
}
