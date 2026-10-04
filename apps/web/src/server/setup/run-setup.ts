import { DatabaseAheadOfAppError } from "../db/migrate";
import { redactDatabaseUrl } from "../db/url";
import { IdentityError } from "../domains/identity/exceptions/errors";
import { validatePassword } from "../domains/identity/models/password";
import { normalizeEmail, normalizeName } from "../domains/identity/models/user";
import { defaultDataPath, defaultPublicUrl, scriptCommand } from "../runtime";
import { buildDatabaseUrl, type DatabaseAnswers, DEFAULT_PORTS } from "./database-url";
import { readEnvFile } from "./env-file";
import type { SetupPrompts } from "./prompts";
import { normalizePublicUrl, PUBLIC_URL_RULE } from "./public-url";
import {
  applyMigrations,
  checkDatabase,
  createRootAccount,
  describeServer,
  formatProblem,
  listRootAccounts,
  writeSettings,
} from "./steps";

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

const wrap = (validate: (value: string) => unknown) => (value: string) => {
  try {
    validate(value);
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
};

/**
 * The interactive (or scripted) setup from MVP §5 and feature 003: the prompts and the loops,
 * around the steps in `steps.ts` that the web setup (036) shares. Each step is safe to repeat.
 */
export const runSetup = async (options: SetupOptions): Promise<SetupResult> => {
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

  let answers: DatabaseAnswers | undefined;
  for (;;) {
    if (!databaseUrl) {
      answers = await askDatabase(prompts, answers);
      databaseUrl = buildDatabaseUrl(answers);
    }
    const check = await checkDatabase(databaseUrl, { appDir });
    if (check.ok) {
      if (check.warning) prompts.log.warn(check.warning);
      prompts.log.success(`Connected to ${describeServer(check)} and checked permissions.`);
      break;
    }
    const problem = formatProblem(check.problem);
    prompts.log.error(problem);
    if (!prompts.interactive) throw new SetupFailedError(problem);
    databaseUrl = undefined;
  }

  // 5. Public URL.
  const publicUrl = normalizePublicUrl(
    await prompts.text({
      id: "public_url",
      message: "Where will people open Ronne AI Marketplace (PUBLIC_URL)?",
      initial: env.PUBLIC_URL || defaultPublicUrl(),
      validate: (value) => (normalizePublicUrl(value) ? undefined : PUBLIC_URL_RULE),
    }),
  ) as string;

  // 6. .env. An existing AUTH_SECRET is always kept: a new one would sign everyone out.
  const written = writeSettings({
    appDir,
    envPath,
    databaseUrl,
    publicUrl,
    storagePath: options.storagePath,
  });
  if (written.weakSecret) {
    prompts.log.warn(
      "The AUTH_SECRET in .env is shorter than 32 characters. It's kept, but consider replacing it.",
    );
  }
  prompts.log.success(`Saved ${envPath} (readable only by you).`);

  // 7. Migrations.
  try {
    const { applied } = await applyMigrations(databaseUrl, { appDir });
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
  const roots = await listRootAccounts(databaseUrl, { appDir });
  const [first] = roots;
  if (first) {
    prompts.log.info(
      roots.length === 1
        ? `A root account already exists (${first.email}). Setup doesn't create another.`
        : `${roots.length} root accounts already exist (first: ${first.email}). Setup doesn't create another.`,
    );
    if (roots.every((root) => root.disabledAt)) {
      prompts.log.warn(
        roots.length === 1
          ? `That root account is disabled. Run \`${scriptCommand("reset-root-password")}\` to enable it again.`
          : `Every root account is disabled. Run \`${scriptCommand("reset-root-password")} --email <one of them>\` to enable one again.`,
      );
    }
    return { publicUrl, rootEmail: first.email, rootCreated: false };
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
    const root = await createRootAccount(
      databaseUrl,
      { appDir },
      { email, name, password },
      {
        via: "cli",
      },
    );
    prompts.log.success(`Created the root account ${root.email}.`);
    return { publicUrl, rootEmail: root.email, rootCreated: true };
  } catch (error) {
    if (error instanceof IdentityError) throw new SetupFailedError(error.message);
    throw error;
  }
};

const askDatabase = async (
  prompts: SetupPrompts,
  previous?: DatabaseAnswers,
): Promise<DatabaseAnswers> => {
  const dialect = await prompts.select({
    id: "database.kind",
    message: "Which database should Ronne AI Marketplace use?",
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
      initial: previous?.dialect === "sqlite" ? previous.path : defaultDataPath("ronne.db"),
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
};
