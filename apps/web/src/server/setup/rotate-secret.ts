import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { createDb } from "../db/create-db";
import { endSessionsForNewSecret } from "../domains/identity/actions/instance-access";
import { hostCommand, restartHint, runtimeOf, scriptCommand } from "../runtime";
import {
  EnvMergeError,
  firstUnplainLine,
  generateAuthSecret,
  InPlaceWriteError,
  mergeEnv,
  writeEnvFile,
} from "./env-file";
import type { SetupPrompts } from "./prompts";
import { SetupFailedError } from "./run-setup";

type Env = Record<string, string | undefined>;

/** What to do about a file error, by its code: permissions, or anything else. */
const adviceFor = (code: string) =>
  code === "EACCES" || code === "EPERM" || code === "EROFS"
    ? "run it as the account that owns the settings file"
    : "fix the cause (a full disk?) and run this again";

/**
 * Reads a settings file; a missing one reads as empty, as the server reads it (config.ts). A
 * failure shows its code, never the path (an environment value).
 */
const readSettings = (path: string): string => {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "an error";
    if (code === "ENOENT") return "";
    throw new SetupFailedError(
      `A settings file couldn't be read (${code}). Nothing was changed: ${adviceFor(code)}.`,
    );
  }
};

/** A line that sets AUTH_SECRET in a form Next.js's loader (dotenv) reads, `KEY: value` included. */
const SETS_SECRET = /^\s*(?:export\s+)?AUTH_SECRET\s*[=:]/m;

/** The other files Next.js loads over `.env` in a clone (`pnpm dev`, `pnpm start`). */
const NEXT_ENV_FILES = [
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
];

/** A command to run next, quoted, as typed on the host; with sudo for a service. */
const followUp = (name: string, args: string, env: Env) => {
  const command = `${hostCommand(name, env)} ${args}`;
  if (runtimeOf(env) !== "npm" || env.RONNE_SERVICE !== "1") return `\`${command}\``;
  return `\`sudo ${command}\``;
};

/**
 * pnpm run rotate-secret (098): writes a new AUTH_SECRET to the settings file, keeping every other
 * line and its 0600 mode, and ends every session, after asking (unless `yes`). Refuses when the
 * secret comes from the environment, which the file can't change, and before setup. The secret is
 * never printed, old or new, and neither is the settings file's path (an environment value).
 */
export const runRotateSecret = async (options: {
  appDir: string;
  envPath: string;
  env: Env;
  prompts: SetupPrompts;
  yes: boolean;
}): Promise<{ sessions: number; twoFactorCleared: number }> => {
  const { appDir, envPath, env, prompts } = options;
  if (env.AUTH_SECRET)
    throw new SetupFailedError(
      "AUTH_SECRET is set in the environment, so the server doesn't read it from the settings file. Change it where it's set, then restart the server.",
    );
  // Every check runs before the question and again after it, on the file as it is then: what's
  // checked last is what's used (the database it names, the text that's rewritten).
  const check = () => {
    const text = readSettings(envPath);
    const file = parseEnv(text);
    const databaseUrl = env.DATABASE_URL || file.DATABASE_URL;
    if (!file.AUTH_SECRET || !databaseUrl)
      throw new SetupFailedError(
        `This instance isn't set up yet, so it has no secret to replace. Run \`${scriptCommand("setup")}\` first.`,
      );
    // In a clone, Next.js also loads these files over the settings file (the app's own .env too,
    // when the settings file is another one): an AUTH_SECRET in one of them would stay in effect.
    if (runtimeOf(env) === "node") {
      const other = [".env", ...NEXT_ENV_FILES]
        .filter((name) => resolve(appDir, name) !== resolve(envPath))
        .find((name) => {
          const path = join(appDir, name);
          return existsSync(path) && SETS_SECRET.test(readSettings(path));
        });
      if (other)
        throw new SetupFailedError(
          `AUTH_SECRET is also set in the app folder's ${other}, which Next.js loads over the settings file. Nothing was changed: remove it there first.`,
        );
    }
    // Only a plain file is rewritten: both the server's reader and Next.js's read it the same way,
    // so the new secret, and nothing else, is what either of them reads afterwards.
    const unplain = firstUnplainLine(text);
    if (unplain !== null)
      throw new SetupFailedError(
        `Line ${unplain} of the settings file isn't a plain KEY=value line (a multi-line or escaped value, KEY: value, a stray line break, or a value ending in a backslash). Nothing was changed: edit the file by hand, then run this again.`,
      );
    return { text, databaseUrl };
  };
  check();

  if (!options.yes) {
    const sure = await prompts.confirm({
      id: "rotate.confirm",
      message:
        "Replace AUTH_SECRET? Everyone is signed out, you included, and two-factor sign-in is turned off for everyone who has it.",
      initial: false,
    });
    if (!sure) throw new SetupFailedError("Cancelled. The secret wasn't changed.");
  }
  const { text: existing, databaseUrl } = check();

  // The new file is made, and read back, before anything changes: mergeEnv checks that the server
  // reads the new secret from it and every other setting as before.
  let content: string;
  try {
    content = mergeEnv(existing, { AUTH_SECRET: generateAuthSecret() }, { replaceKept: true });
  } catch (error) {
    if (error instanceof EnvMergeError)
      throw new SetupFailedError(
        "The settings file has an AUTH_SECRET this command can't replace safely (inside a multi-line value?). Nothing was changed: edit the file by hand.",
      );
    throw error;
  }

  const { db, dialect } = createDb(databaseUrl, { baseDir: appDir });
  let written = false;
  try {
    let sessions: number;
    let twoFactorCleared: number;
    try {
      ({ sessions, twoFactorCleared } = await endSessionsForNewSecret(db, dialect, () => {
        try {
          writeEnvFile(envPath, content);
        } catch (error) {
          // Written in full, then setting the mode failed: the new secret is in place.
          if (error instanceof InPlaceWriteError && error.complete) {
            written = true;
            throw error;
          }
          if (error instanceof InPlaceWriteError)
            throw new SetupFailedError(
              `The settings file was being rewritten in place and that failed (${error.code ?? "an error"}): it may be incomplete. Check it, and restore it from a backup if needed. The sessions weren't ended.`,
            );
          // The error's message names the file; only its code is shown.
          const code = (error as NodeJS.ErrnoException).code ?? "an error";
          throw new SetupFailedError(
            `The settings file couldn't be written (${code}). Nothing was changed: ${adviceFor(code)}.`,
          );
        }
        written = true;
      }));
    } catch (error) {
      // Written, then the database failed to commit: the new secret is in place, sessions aren't ended.
      if (written)
        throw new SetupFailedError(
          `The new AUTH_SECRET was written, but ending the sessions failed. Run ${followUp("revoke-access", "--everyone --sessions-only", env)}${runtimeOf(env) === "node" ? `, then restart the server: ${restartHint(env)}` : ""}. Two-factor sign-in wasn't turned off either, and its secrets can't be read with the new AUTH_SECRET: run ${followUp("rotate-secret", "--yes", env)} again once the database answers, or ${followUp("reset-two-factor", "--email <email>", env)} for each person who has it.`,
        );
      throw error;
    }
    prompts.log.success(
      `Wrote a new AUTH_SECRET to the settings file and ended ${sessions} ${sessions === 1 ? "session" : "sessions"}.`,
    );
    // Docker and rmk-server read the settings file on each request; a clone's Next.js loaded .env
    // when it started.
    if (runtimeOf(env) === "node")
      prompts.log.info(`Restart the server so it reads the new secret: ${restartHint(env)}.`);
    else prompts.log.info("The server uses the new secret from its next request.");
    // Their secrets were encrypted with the old AUTH_SECRET (105).
    if (twoFactorCleared > 0)
      prompts.log.info(
        `Turned off two-factor sign-in for ${twoFactorCleared} ${twoFactorCleared === 1 ? "account" : "accounts"}: its secrets were encrypted with the old AUTH_SECRET. They set it up again on their Account page.`,
      );
    prompts.log.info("Access tokens keep working; to revoke them too, run revoke-access.");
    return { sessions, twoFactorCleared };
  } finally {
    await db.destroy();
  }
};
