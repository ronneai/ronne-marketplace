// pnpm run disable-sso (106): turns every identity provider off and lets everyone sign in with a
// password again, for when a provider breaks. Asks first in a terminal; --yes doesn't ask.
// Exit codes: 0 done, 1 failed or cancelled, 2 invalid input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { envFilePath } from "../src/server/config";
import { clackPrompts } from "../src/server/setup/clack-prompts";
import { DISABLE_SSO_USAGE, parseDisableSsoCommand } from "../src/server/setup/cli";
import { runDisableSso } from "../src/server/setup/disable-sso";
import {
  InvalidInputError,
  MissingInputError,
  nonInteractivePrompts,
} from "../src/server/setup/non-interactive-prompts";
import { SetupCancelledError } from "../src/server/setup/prompts";
import { SetupFailedError } from "../src/server/setup/run-setup";

const appDir = resolve(import.meta.dirname, "..");
const envPath = envFilePath(appDir);
const command = parseDisableSsoCommand(
  process.argv.slice(2),
  process.env,
  Boolean(process.stdin.isTTY && process.stdout.isTTY),
);

if (command.mode === "help") {
  console.log(DISABLE_SSO_USAGE);
  process.exit(0);
}
if (command.mode === "error") {
  console.error(`✗ ${command.message}\n\n${DISABLE_SSO_USAGE}`);
  process.exit(command.exitCode);
}

const interactive = command.mode === "interactive";
if (interactive) p.intro("Turn off company sign-in");
try {
  await runDisableSso({
    appDir,
    envPath,
    prompts: interactive ? clackPrompts : nonInteractivePrompts({}),
    yes: !interactive,
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
      ? "Cancelled. Nothing was changed."
      : (error as Error).message;
  if (interactive) p.cancel(message);
  else console.error(`✗ ${message}`);
  process.exitCode = exitCode;
}
