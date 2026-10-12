// pnpm run revoke-access (098): ends sessions and revokes access tokens, for everyone
// (--everyone) or one person (--user <email>); --sessions-only or --tokens-only for half. Asks
// first in a terminal; --yes doesn't ask.
// Exit codes: 0 done, 1 failed or cancelled (for example, an unknown email), 2 invalid input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { envFilePath } from "../src/server/config";
import { clackPrompts } from "../src/server/setup/clack-prompts";
import { parseRevokeAccessCommand, REVOKE_ACCESS_USAGE } from "../src/server/setup/cli";
import {
  InvalidInputError,
  MissingInputError,
  nonInteractivePrompts,
} from "../src/server/setup/non-interactive-prompts";
import { SetupCancelledError } from "../src/server/setup/prompts";
import { runRevokeAccess } from "../src/server/setup/revoke-access";
import { SetupFailedError } from "../src/server/setup/run-setup";

const appDir = resolve(import.meta.dirname, "..");
const envPath = envFilePath(appDir);
const command = parseRevokeAccessCommand(
  process.argv.slice(2),
  process.env,
  Boolean(process.stdin.isTTY && process.stdout.isTTY),
);

if (command.mode === "help") {
  console.log(REVOKE_ACCESS_USAGE);
  process.exit(0);
}
if (command.mode === "error") {
  console.error(`✗ ${command.message}\n\n${REVOKE_ACCESS_USAGE}`);
  process.exit(command.exitCode);
}

const interactive = command.mode === "interactive";
if (interactive) p.intro("Revoke access");
try {
  await runRevokeAccess({
    appDir,
    envPath,
    prompts: interactive ? clackPrompts : nonInteractivePrompts({}),
    yes: !interactive,
    target: command.target,
    kinds: command.kinds,
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
      ? "Cancelled. Nothing was revoked."
      : (error as Error).message;
  if (interactive) p.cancel(message);
  else console.error(`✗ ${message}`);
  process.exitCode = exitCode;
}
