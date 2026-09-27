import { createDb } from "../db/create-db";
import { resetRootPassword } from "../domains/identity/actions/root-account";
import { IdentityError, InvalidPasswordError } from "../domains/identity/exceptions/errors";
import { validatePassword } from "../domains/identity/models/password";
import { readEnvFile } from "./env-file";
import { MissingInputError } from "./non-interactive-prompts";
import type { SetupPrompts } from "./prompts";
import { SetupFailedError } from "./run-setup";

/**
 * pnpm run reset-root-password: sets a new root password, ends root's sessions, revokes its access
 * tokens and re-enables it (feature 003). Reads DATABASE_URL from the environment or .env.
 */
export async function runResetRootPassword(options: {
  appDir: string;
  envPath: string;
  prompts: SetupPrompts;
  databaseUrl?: string;
}): Promise<{ email: string }> {
  const { appDir, envPath, prompts } = options;
  const databaseUrl = options.databaseUrl || readEnvFile(envPath).DATABASE_URL;
  if (!databaseUrl)
    throw new MissingInputError("DATABASE_URL (run `pnpm run setup` first, or set it)");

  const validate = (value: string) => {
    try {
      validatePassword(value);
      return undefined;
    } catch (error) {
      return (error as Error).message;
    }
  };
  let password: string;
  for (;;) {
    password = await prompts.password({
      id: "root.password",
      message: "New root password (12 to 128 characters)",
      validate,
    });
    const again = await prompts.password({ id: "root.password_again", message: "Type it again" });
    if (again === password) break;
    prompts.log.error("The two passwords don't match.");
    if (!prompts.interactive) throw new SetupFailedError("The two passwords don't match.");
  }

  const { db, dialect } = createDb(databaseUrl, { baseDir: appDir });
  try {
    const { email } = await resetRootPassword(db, dialect, password);
    prompts.log.success(
      `Reset the password for ${email}. Root's sessions were ended and its access tokens revoked.`,
    );
    return { email };
  } catch (error) {
    if (error instanceof InvalidPasswordError) throw error;
    if (error instanceof IdentityError) throw new SetupFailedError(error.message);
    throw error;
  } finally {
    await db.destroy();
  }
}
