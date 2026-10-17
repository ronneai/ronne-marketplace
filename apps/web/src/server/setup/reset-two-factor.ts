import { createDb } from "../db/create-db";
import { resetTwoFactorFromCli, twoFactorOfEmail } from "../domains/identity/actions/root-account";
import {
  IdentityError,
  InvalidEmailError,
  UserNotFoundError,
} from "../domains/identity/exceptions/errors";
import { scriptCommand } from "../runtime";
import { readEnvFile } from "./env-file";
import { InvalidInputError, MissingInputError } from "./non-interactive-prompts";
import type { SetupPrompts } from "./prompts";
import { SetupFailedError } from "./run-setup";

/**
 * pnpm run reset-two-factor (105): turns off one account's two-factor sign-in and ends its
 * sessions, after asking (unless `yes`); says so when it had none. Reads DATABASE_URL from the
 * environment or .env.
 */
export const runResetTwoFactor = async (options: {
  appDir: string;
  envPath: string;
  prompts: SetupPrompts;
  yes: boolean;
  email: string;
  databaseUrl?: string;
}): Promise<{ reset: boolean }> => {
  const { appDir, envPath, prompts } = options;
  const databaseUrl = options.databaseUrl || readEnvFile(envPath).DATABASE_URL;
  if (!databaseUrl)
    throw new MissingInputError(
      `DATABASE_URL (run \`${scriptCommand("setup")}\` first, or set it)`,
    );

  const { db, dialect } = createDb(databaseUrl, { baseDir: appDir });
  try {
    const now = await twoFactorOfEmail(db, dialect, options.email);
    if (!now.enabled) {
      prompts.log.info(`${now.email} has no two-factor sign-in: nothing to reset.`);
      return { reset: false };
    }
    if (!options.yes) {
      const sure = await prompts.confirm({
        id: "reset_two_factor.confirm",
        message: `Turn off two-factor sign-in for ${now.email} and end its sessions?`,
        initial: false,
      });
      if (!sure) throw new SetupFailedError("Cancelled. Nothing was reset.");
    }
    const result = await resetTwoFactorFromCli(db, dialect, options.email);
    if (!result.reset) {
      prompts.log.info(`${result.email} has no two-factor sign-in now: nothing to reset.`);
      return { reset: false };
    }
    prompts.log.success(
      `Turned off two-factor sign-in for ${result.email} and ended ${result.sessionsEnded} ${result.sessionsEnded === 1 ? "session" : "sessions"}.`,
    );
    prompts.log.info(
      "They sign in with their password, and set two-factor up again if it's required of them.",
    );
    return { reset: true };
  } catch (error) {
    if (error instanceof InvalidEmailError) throw new InvalidInputError("--email", error.message);
    if (error instanceof UserNotFoundError)
      throw new SetupFailedError(`No account has the email ${options.email}.`);
    if (error instanceof IdentityError) throw new SetupFailedError(error.message);
    throw error;
  } finally {
    await db.destroy();
  }
};
