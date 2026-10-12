// pnpm run rotate-secret (098): writes a new AUTH_SECRET to the settings file and ends every
// session. Asks first in a terminal; --yes doesn't ask. Docker and rmk-server use it from their
// next request; a clone's server needs a restart.
// Exit codes: 0 done, 1 failed or cancelled (for example, not set up), 2 invalid input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { envFilePath } from "../src/server/config";
import { clackPrompts } from "../src/server/setup/clack-prompts";
import { parseRotateSecretCommand, ROTATE_SECRET_USAGE } from "../src/server/setup/cli";
import { nonInteractivePrompts } from "../src/server/setup/non-interactive-prompts";
import { SetupCancelledError } from "../src/server/setup/prompts";
import { runRotateSecret } from "../src/server/setup/rotate-secret";
import { SetupFailedError } from "../src/server/setup/run-setup";

const appDir = resolve(import.meta.dirname, "..");
const envPath = envFilePath(appDir);
const command = parseRotateSecretCommand(
  process.argv.slice(2),
  Boolean(process.stdin.isTTY && process.stdout.isTTY),
);

if (command.mode === "help") {
  console.log(ROTATE_SECRET_USAGE);
  process.exit(0);
}
if (command.mode === "error") {
  console.error(`✗ ${command.message}\n\n${ROTATE_SECRET_USAGE}`);
  process.exit(command.exitCode);
}

const interactive = command.mode === "interactive";
if (interactive) p.intro("Replace AUTH_SECRET");
try {
  await runRotateSecret({
    appDir,
    envPath,
    env: process.env,
    prompts: interactive ? clackPrompts : nonInteractivePrompts({}),
    yes: !interactive,
  });
  if (interactive) p.outro("Done.");
} catch (error) {
  if (!(error instanceof SetupCancelledError || error instanceof SetupFailedError)) throw error;
  const message =
    error instanceof SetupCancelledError
      ? "Cancelled. The secret wasn't changed."
      : (error as Error).message;
  if (interactive) p.cancel(message);
  else console.error(`✗ ${message}`);
  process.exitCode = 1;
}
