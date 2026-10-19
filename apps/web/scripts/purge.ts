// pnpm run purge (102): one retention purge now, by root's settings, under the same lease the
// server's scheduler takes. --dry-run counts and changes nothing.
// Exit codes: 0 done (or nothing to do), 1 the lease was held or the run failed, 2 invalid input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { envFilePath } from "../src/server/config";
import { clackPrompts } from "../src/server/setup/clack-prompts";
import { PURGE_USAGE, parsePurgeCommand } from "../src/server/setup/cli";
import {
  InvalidInputError,
  MissingInputError,
  nonInteractivePrompts,
} from "../src/server/setup/non-interactive-prompts";
import { runPurge } from "../src/server/setup/purge";
import { SetupFailedError } from "../src/server/setup/run-setup";

const appDir = resolve(import.meta.dirname, "..");
const envPath = envFilePath(appDir);
const command = parsePurgeCommand(process.argv.slice(2), process.env);

if (command.mode === "help") {
  console.log(PURGE_USAGE);
  process.exit(0);
}
if (command.mode === "error") {
  console.error(`✗ ${command.message}\n\n${PURGE_USAGE}`);
  process.exit(command.exitCode);
}

const terminal = Boolean(process.stdout.isTTY);
if (terminal) p.intro(command.dryRun ? "Retention purge (dry run)" : "Retention purge");
try {
  await runPurge({
    appDir,
    envPath,
    prompts: terminal ? clackPrompts : nonInteractivePrompts({}),
    dryRun: command.dryRun,
    databaseUrl: command.databaseUrl,
    progress: terminal,
  });
  if (terminal) p.outro("Done.");
} catch (error) {
  const exitCode = error instanceof MissingInputError || error instanceof InvalidInputError ? 2 : 1;
  if (exitCode === 1 && !(error instanceof SetupFailedError)) throw error;
  const message = (error as Error).message;
  if (terminal) p.cancel(message);
  else console.error(`✗ ${message}`);
  process.exitCode = exitCode;
}
