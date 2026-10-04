import { createDb } from "../db/create-db";
import { listRoots, resetRootPassword } from "../domains/identity/actions/root-account";
import {
  IdentityError,
  InvalidPasswordError,
  NotARootError,
  RootNotFoundError,
} from "../domains/identity/exceptions/errors";
import { validatePassword } from "../domains/identity/models/password";
import { normalizeEmail, type RootAccount } from "../domains/identity/models/user";
import { scriptCommand } from "../runtime";
import { readEnvFile } from "./env-file";
import { InvalidInputError, MissingInputError } from "./non-interactive-prompts";
import type { SetupPrompts } from "./prompts";
import { SetupFailedError } from "./run-setup";

/**
 * Says which root to reset: the one `--email` names, the only one, or (in a terminal) the one the
 * person picks. Non-interactive with several roots needs `--email` (059).
 */
const chooseRoot = async (
  roots: RootAccount[],
  email: string | undefined,
  prompts: SetupPrompts,
): Promise<RootAccount> => {
  if (email !== undefined) {
    let wanted: string;
    try {
      wanted = normalizeEmail(email);
    } catch (error) {
      throw new InvalidInputError("--email", (error as Error).message);
    }
    const root = roots.find((r) => r.email === wanted);
    if (!root) throw new InvalidInputError("--email", new NotARootError(wanted).message);
    return root;
  }
  const [first] = roots;
  if (roots.length === 1 && first) return first;
  if (!prompts.interactive)
    throw new MissingInputError(
      `--email (or RONNE_ROOT_EMAIL): there are ${roots.length} root accounts`,
    );
  const id = await prompts.select({
    id: "root.which",
    message: `There are ${roots.length} root accounts. Which one's password?`,
    choices: roots.map((r) => ({
      value: r.id,
      label: r.email,
      hint: r.disabledAt ? `${r.name}, disabled` : r.name,
    })),
  });
  const chosen = roots.find((r) => r.id === id);
  if (!chosen) throw new SetupFailedError("That root account no longer exists.");
  return chosen;
};

/**
 * pnpm run reset-root-password: sets a new password for a root, ends its sessions, revokes its
 * access tokens and re-enables it (feature 003). With several roots, `rootEmail` or a choice says
 * which (059). Reads DATABASE_URL from the environment or .env.
 */
export const runResetRootPassword = async (options: {
  appDir: string;
  envPath: string;
  prompts: SetupPrompts;
  databaseUrl?: string;
  rootEmail?: string;
}): Promise<{ email: string }> => {
  const { appDir, envPath, prompts } = options;
  const databaseUrl = options.databaseUrl || readEnvFile(envPath).DATABASE_URL;
  if (!databaseUrl)
    throw new MissingInputError(
      `DATABASE_URL (run \`${scriptCommand("setup")}\` first, or set it)`,
    );

  const validate = (value: string) => {
    try {
      validatePassword(value);
      return undefined;
    } catch (error) {
      return (error as Error).message;
    }
  };

  const { db, dialect } = createDb(databaseUrl, { baseDir: appDir });
  try {
    const roots = await listRoots(db, dialect);
    if (roots.length === 0) throw new RootNotFoundError();
    const root = await chooseRoot(roots, options.rootEmail, prompts);

    let password: string;
    for (;;) {
      password = await prompts.password({
        id: "root.password",
        message: `New password for ${root.email} (12 to 128 characters)`,
        validate,
      });
      const again = await prompts.password({ id: "root.password_again", message: "Type it again" });
      if (again === password) break;
      prompts.log.error("The two passwords don't match.");
      if (!prompts.interactive) throw new SetupFailedError("The two passwords don't match.");
    }

    const { email } = await resetRootPassword(db, dialect, password, root.email);
    prompts.log.success(
      `Reset the password for ${email}. Its sessions were ended and its access tokens revoked.`,
    );
    return { email };
  } catch (error) {
    if (error instanceof InvalidPasswordError) throw error;
    if (error instanceof IdentityError) throw new SetupFailedError(error.message);
    throw error;
  } finally {
    await db.destroy();
  }
};
