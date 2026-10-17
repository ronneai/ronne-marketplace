// pnpm run reset-two-factor --email <email> (105): turns off one account's two-factor sign-in and
// ends its sessions, for a lost phone and lost backup codes. Asks first in a terminal; --yes
// doesn't ask.
// Exit codes: 0 done (or nothing to reset), 1 failed or cancelled (for example, an unknown email),
// 2 invalid input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { envFilePath } from "../src/server/config";
import { clackPrompts } from "../src/server/setup/clack-prompts";
import { parseResetTwoFactorCommand, RESET_TWO_FACTOR_USAGE } from "../src/server/setup/cli";
import {
  InvalidInputError,
  MissingInputError,
  nonInteractivePrompts,
} from "../src/server/setup/non-interactive-prompts";
import { SetupCancelledError } from "../src/server/setup/prompts";
import { runResetTwoFactor } from "../src/server/setup/reset-two-factor";
import { SetupFailedError } from "../src/server/setup/run-setup";

const appDir = resolve(import.meta.dirname, "..");
const envPath = envFilePath(appDir);
const command = parseResetTwoFactorCommand(
  process.argv.slice(2),
  process.env,
  Boolean(process.stdin.isTTY && process.stdout.isTTY),
);

if (command.mode === "help") {
  console.log(RESET_TWO_FACTOR_USAGE);
  process.exit(0);
}
if (command.mode === "error") {
  console.error(`✗ ${command.message}\n\n${RESET_TWO_FACTOR_USAGE}`);
  process.exit(command.exitCode);
}

const interactive = command.mode === "interactive";
if (interactive) p.intro("Reset two-factor sign-in");
try {
  await runResetTwoFactor({
    appDir,
    envPath,
    prompts: interactive ? clackPrompts : nonInteractivePrompts({}),
    yes: !interactive,
    email: command.email,
    databaseUrl: command.databaseUrl,
  });
  if (interactive) p.outro("Done.");
} catch (error) {
  const exitCode = error instanceof MissingInputError || error instanceof InvalidInputError ? 2 : 1;
  if (
    exitCode === 1 &&
    !(error instanceof SetupCancelledError || error instanceof SetupFailedError)
  )
    throw error;
  const message =
    error instanceof SetupCancelledError
      ? "Cancelled. Nothing was reset."
      : (error as Error).message;
  if (interactive) p.cancel(message);
  else console.error(`✗ ${message}`);
  process.exitCode = exitCode;
}
