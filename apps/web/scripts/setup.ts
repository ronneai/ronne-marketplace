// pnpm run setup: configures this instance (feature 003). `pnpm setup` without `run` is a pnpm
// built-in that configures pnpm itself, so always use `pnpm run setup`.
//
// Interactive in a terminal. Non-interactive with --yes (or CI=true without a terminal), reading
// DATABASE_URL, PUBLIC_URL, STORAGE_PATH, RONNE_ROOT_EMAIL, RONNE_ROOT_NAME and RONNE_ROOT_PASSWORD
// (or --database-url, --public-url, --storage-path, --root-email, --root-name).
// Exit codes: 0 done, 1 a check or step failed, 2 invalid or missing input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { envFilePath } from "../src/server/config";
import { clackPrompts } from "../src/server/setup/clack-prompts";
import { parseSetupCommand } from "../src/server/setup/cli";
import {
  InvalidInputError,
  MissingInputError,
  nonInteractivePrompts,
} from "../src/server/setup/non-interactive-prompts";
import { SetupCancelledError } from "../src/server/setup/prompts";
import { runSetup, SetupFailedError } from "../src/server/setup/run-setup";

const appDir = resolve(import.meta.dirname, "..");
// RONNE_ENV_FILE moves .env, for Docker's data volume (feature 005) and for tests.
const envPath = envFilePath(appDir);

const command = parseSetupCommand(
  process.argv.slice(2),
  process.env,
  Boolean(process.stdin.isTTY && process.stdout.isTTY),
);

if (command.mode === "error") {
  console.error(`✗ ${command.message}`);
  process.exit(command.exitCode);
}

const interactive = command.mode === "interactive";
if (interactive) p.intro("Ronne setup");

try {
  const result = await runSetup({
    appDir,
    envPath,
    prompts: interactive ? clackPrompts : nonInteractivePrompts(command),
    databaseUrl: interactive ? undefined : command.databaseUrl,
    storagePath: interactive ? undefined : command.storagePath,
  });
  // In the Docker image (RONNE_RUNTIME=docker) the server is already running and needs a restart.
  const done =
    process.env.RONNE_RUNTIME === "docker"
      ? [
          "Ronne is set up.",
          "Restart it with `docker compose restart web`,",
          `then open ${result.publicUrl} and sign in as ${result.rootEmail}.`,
        ]
      : [
          "Ronne is set up.",
          "Start it with `pnpm build && pnpm start` (or `pnpm dev` while developing),",
          `then open ${result.publicUrl} and sign in as ${result.rootEmail}.`,
        ];
  if (interactive) p.outro(done.join("\n"));
  else console.log(done.join("\n"));
} catch (error) {
  const exitCode = error instanceof MissingInputError || error instanceof InvalidInputError ? 2 : 1;
  const known =
    error instanceof SetupCancelledError || error instanceof SetupFailedError || exitCode === 2;
  if (!known) throw error;
  if (interactive) p.cancel((error as Error).message);
  else console.error(`✗ ${(error as Error).message}`);
  process.exitCode = exitCode;
}
