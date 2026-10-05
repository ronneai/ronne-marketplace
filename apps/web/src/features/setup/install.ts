import { type AppConfig, loadConfig } from "@/server/config";
import type { CreatedDb } from "@/server/db/create-db";
import { getAppDb } from "@/server/db/instance";
import { DatabaseAheadOfAppError } from "@/server/db/migrate";
import { redactDatabaseUrl } from "@/server/db/url";
import {
  InvalidEmailError,
  InvalidNameError,
  InvalidPasswordError,
  RootAlreadyExistsError,
} from "@/server/domains/identity/exceptions/errors";
import type { RootOrigin } from "@/server/domains/identity/services/root-account";
import { buildDatabaseUrl } from "@/server/setup/database-url";
import { normalizePublicUrl, PUBLIC_URL_RULE } from "@/server/setup/public-url";
import { getSetupState, markSetupReady, type SetupState } from "@/server/setup/state";
import {
  applyMigrations,
  checkDatabase,
  createRootAccount,
  writeSettings,
} from "@/server/setup/steps";
import { readDatabaseAnswers, readRootInput, readValues } from "./form";
import {
  type InstallState,
  PENDING_STEPS,
  type SetupError,
  type StepOutcome,
  type TestResult,
} from "./types";

/**
 * The web setup's steps (feature 036), over `server/setup/steps.ts`, as functions of a context
 * so they can be tested against a temporary app folder. `actions.ts` wraps them as server actions.
 */
export type SetupContext = {
  appDir: string;
  /** The settings file (`envFilePath`), also what `env.RONNE_ENV_FILE` names. */
  envPath: string;
  env: Record<string, string | undefined>;
  getDb: (url: string) => CreatedDb;
  origin: RootOrigin;
};

export const ALREADY_SET_UP = "Someone already set this instance up. Sign in.";
export const DATABASE_UNAVAILABLE =
  "The database in the settings isn't answering, so the setup won't run: it never changes a configured instance from the browser. Fix the database, or the settings on the server (pnpm run setup, or rmk-server setup), then reload.";
const NOT_CONFIGURED = "Write the settings first.";

const error = (
  code: SetupError["code"],
  section: SetupError["section"],
  message: string,
  extra: Partial<SetupError> = {},
): StepOutcome => ({ ok: false, error: { code, section, message, ...extra } });

const config = (context: SetupContext): AppConfig =>
  loadConfig({ appDir: context.appDir, env: context.env });

/**
 * The guard every step runs first. The setup runs only on an instance that isn't set up yet:
 * `not_configured`, or `incomplete` (its database answered, with no root). Never `ready`, and never
 * `unavailable`: there are settings, but the database doesn't answer, which anyone can wait for
 * (and, on a server database, cause), so the browser must never get to point a configured instance
 * at another database (036; security audit AUTHZ-1, 2026-10-05). Production remembers `ready`, so
 * refusing a set-up instance costs no database query.
 */
const refusal = async (
  context: SetupContext,
  section: SetupError["section"],
): Promise<{ state: SetupState; refused?: SetupError }> => {
  const current = await getSetupState(config(context), { getDb: context.getDb });
  if (current === "ready")
    return {
      state: current,
      refused: { code: "already_set_up", section, message: ALREADY_SET_UP },
    };
  if (current === "unavailable")
    return {
      state: current,
      refused: { code: "database_unavailable", section, message: DATABASE_UNAVAILABLE },
    };
  return { state: current };
};

/** The database URL the form asks for, or the one already in the settings when asked to keep it. */
const databaseUrlFrom = async (
  context: SetupContext,
  form: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: SetupError }> => {
  const current = config(context).databaseUrl;
  if (form.get("database.keep") === "on" && current) return { ok: true, url: current };
  const answers = readDatabaseAnswers(form);
  if (!answers.ok) return answers;
  return { ok: true, url: buildDatabaseUrl(answers.answers) };
};

const test = async (context: SetupContext, url: string): Promise<TestResult> => {
  const check = await checkDatabase(url, { appDir: context.appDir });
  if (check.ok) return check;
  return {
    ok: false,
    error: {
      code: "database",
      section: "database",
      message: check.problem.explanation,
      detail: check.problem.detail,
    },
  };
};

/** "Test connection": the same checks and words as the terminal. */
export const testDatabaseWith = async (
  context: SetupContext,
  form: FormData,
): Promise<TestResult> => {
  const { refused } = await refusal(context, "database");
  if (refused) return { ok: false, error: refused };
  const url = await databaseUrlFrom(context, form);
  if (!url.ok) return url;
  return test(context, url.url);
};

/** Step 1: check the database, then write the settings file. */
export const installSettingsWith = async (
  context: SetupContext,
  form: FormData,
): Promise<StepOutcome> => {
  const { refused } = await refusal(context, "database");
  if (refused) return { ok: false, error: refused };
  const url = await databaseUrlFrom(context, form);
  if (!url.ok) return { ok: false, error: url.error };
  const checked = await test(context, url.url);
  if (!checked.ok) return checked;

  // The environment wins over the file, so a PUBLIC_URL there is what the instance uses.
  const publicUrl = normalizePublicUrl(context.env.PUBLIC_URL || readValues(form).publicUrl);
  if (!publicUrl) return error("invalid", "instance", PUBLIC_URL_RULE, { field: "public_url" });

  try {
    const written = writeSettings({
      appDir: context.appDir,
      envPath: context.envPath,
      databaseUrl: url.url,
      publicUrl,
      env: context.env,
    });
    const notices: string[] = [];
    if (checked.warning) notices.push(checked.warning);
    if (written.weakSecret)
      notices.push(
        "The AUTH_SECRET already in the settings is shorter than 32 characters. It's kept, but consider replacing it.",
      );
    if (written.restartNeeded)
      notices.push(
        "The settings were written, but this process still uses values from its environment. Restart it and reload this page.",
      );
    return { ok: true, detail: `Settings written to ${written.envPath}`, notices };
  } catch (caught) {
    const code = (caught as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM" || code === "EROFS" || code === "ENOENT") {
      const fix =
        context.env.RONNE_RUNTIME === "docker"
          ? " In Docker, the data volume is owned by root: run `docker compose run --rm --user root web chown -R 1000:1000 /app/data` once."
          : "";
      return error(
        "settings_unwritable",
        "database",
        `The settings file ${context.envPath} can't be written: ${(caught as Error).message}.${fix}`,
      );
    }
    throw caught;
  }
};

/** Step 2: apply the pending migrations to the database in the settings. */
export const installMigrationsWith = async (context: SetupContext): Promise<StepOutcome> => {
  const { state: current, refused } = await refusal(context, "database");
  if (refused) return { ok: false, error: refused };
  if (current === "not_configured") return error("not_configured", "database", NOT_CONFIGURED);
  const url = config(context).databaseUrl as string;
  try {
    const { applied } = await applyMigrations(url, { appDir: context.appDir });
    return {
      ok: true,
      detail:
        applied.length === 0 ? "Database up to date" : `Migrations applied (${applied.length})`,
      notices: [],
    };
  } catch (caught) {
    if (caught instanceof DatabaseAheadOfAppError)
      return error("database_ahead", "database", caught.message);
    return error(
      "migration_failed",
      "database",
      `A migration failed on ${redactDatabaseUrl(url)}: ${(caught as Error).message}`,
    );
  }
};

/** Step 3: create the root account, and mark the instance ready. */
export const installRootWith = async (
  context: SetupContext,
  form: FormData,
): Promise<StepOutcome> => {
  const { state: current, refused } = await refusal(context, "root");
  if (refused) return { ok: false, error: refused };
  if (current === "not_configured") return error("not_configured", "root", NOT_CONFIGURED);
  const input = readRootInput(form);
  if (input.password !== input.again)
    return error("mismatch", "root", "The two passwords don't match.", {
      field: "root.password_again",
    });
  const url = config(context).databaseUrl as string;
  try {
    const root = await createRootAccount(
      url,
      { appDir: context.appDir },
      { email: input.email, name: input.name, password: input.password },
      context.origin,
    );
    markSetupReady(url);
    return {
      ok: true,
      detail: `Root account created (${root.email})`,
      notices: [],
      email: root.email,
    };
  } catch (caught) {
    if (caught instanceof InvalidEmailError)
      return error("invalid", "root", caught.message, { field: "root.email" });
    if (caught instanceof InvalidNameError)
      return error("invalid", "root", caught.message, { field: "root.name" });
    if (caught instanceof InvalidPasswordError)
      return error("invalid", "root", caught.message, { field: "root.password" });
    if (caught instanceof RootAlreadyExistsError)
      return error("already_set_up", "root", ALREADY_SET_UP);
    throw caught;
  }
};

/** The whole install in one request, for the form without JavaScript. */
export const installAllWith = async (
  context: SetupContext,
  previous: InstallState,
  form: FormData,
): Promise<InstallState> => {
  const next: InstallState = {
    steps: { ...PENDING_STEPS },
    notices: [],
    values: readValues(form, previous.values),
  };
  const run = async (
    name: keyof InstallState["steps"],
    step: () => Promise<StepOutcome>,
  ): Promise<StepOutcome> => {
    const outcome = await step();
    if (outcome.ok) {
      next.steps[name] = { status: "done", detail: outcome.detail };
      next.notices.push(...outcome.notices);
    } else {
      next.steps[name] = { status: "failed", detail: outcome.error.message };
      next.error = outcome.error;
    }
    return outcome;
  };
  const settings = await run("settings", () => installSettingsWith(context, form));
  if (!settings.ok) return next;
  const migrations = await run("migrations", () => installMigrationsWith(context));
  if (!migrations.ok) return next;
  const root = await run("root", () => installRootWith(context, form));
  if (root.ok && root.email) next.done = { email: root.email };
  return next;
};

/** The context the running app uses: its folder, its settings file, its environment. */
export const appContext = (origin: RootOrigin): SetupContext => {
  const env = process.env;
  const appDir = process.cwd();
  return {
    appDir,
    envPath: loadConfig({ appDir, env }).envFile,
    env,
    // The app's pool for that URL: a new pool per call would never be closed, and a burst of setup
    // requests would hold one connection each.
    getDb: (url) => getAppDb(url, appDir),
    origin,
  };
};
