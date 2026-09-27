// pnpm run reset-root-password: sets a new root password, ends root's sessions, revokes its access
// tokens and re-enables it. Interactive in a terminal; with --yes it reads RONNE_ROOT_PASSWORD.
// Exit codes: 0 done, 1 failed (for example, no root yet), 2 missing or invalid input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { envFilePath } from "../src/server/config";
import { InvalidPasswordError } from "../src/server/domains/identity/exceptions/errors";
import { clackPrompts } from "../src/server/setup/clack-prompts";
import { parseResetCommand } from "../src/server/setup/cli";
import {
  InvalidInputError,
  MissingInputError,
  nonInteractivePrompts,
} from "../src/server/setup/non-interactive-prompts";
import { SetupCancelledError } from "../src/server/setup/prompts";
import { runResetRootPassword } from "../src/server/setup/reset-root";
import { SetupFailedError } from "../src/server/setup/run-setup";

const appDir = resolve(import.meta.dirname, "..");
const envPath = envFilePath(appDir);
const command = parseResetCommand(
  process.argv.slice(2),
  process.env,
  Boolean(process.stdin.isTTY && process.stdout.isTTY),
);

if (command.mode === "error") {
  console.error(`✗ ${command.message}`);
  process.exit(command.exitCode);
}

const interactive = command.mode === "interactive";
if (interactive) p.intro("Reset the root password");
try {
  await runResetRootPassword({
    appDir,
    envPath,
    prompts: interactive
      ? clackPrompts
      : nonInteractivePrompts({ rootPassword: command.rootPassword }),
    databaseUrl: interactive ? process.env.DATABASE_URL : command.databaseUrl,
  });
  if (interactive) p.outro("Done. Sign in with the new password.");
} catch (error) {
  const exitCode =
    error instanceof MissingInputError ||
    error instanceof InvalidInputError ||
    error instanceof InvalidPasswordError
      ? 2
      : 1;
  if (
    exitCode === 1 &&
    !(error instanceof SetupCancelledError || error instanceof SetupFailedError)
  )
    throw error;
  if (interactive) p.cancel((error as Error).message);
  else console.error(`✗ ${(error as Error).message}`);
  process.exitCode = exitCode;
}
