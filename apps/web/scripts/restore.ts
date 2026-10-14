// pnpm run restore <archive> (099): restores a backup into an empty database and storage, then
// runs the newer migrations. Stop the server first. Asks only for an encrypted archive's
// passphrase, and before restoring versions whose artifact is missing (unless --yes).
// Exit codes: 0 restored, 1 refused or failed (the message says what was left), 2 invalid input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { ignoreOutputErrors, parseRestoreCommand, RESTORE_USAGE } from "../src/server/backup/cli";
import { PassphraseError, readPassphrase } from "../src/server/backup/passphrase";
import { callerCwd } from "../src/server/backup/run-backup";
import { RestoreFailedError, runRestore } from "../src/server/backup/run-restore";

const appDir = resolve(import.meta.dirname, "..");
ignoreOutputErrors();
const command = parseRestoreCommand(process.argv.slice(2));

if (command.mode === "help") {
  console.log(RESTORE_USAGE);
  process.exit(0);
}
if (command.mode === "error") {
  console.error(`✗ ${command.message}\n\n${RESTORE_USAGE}`);
  process.exit(command.exitCode);
}

const cwd = callerCwd(process.env);
const terminal = Boolean(process.stdin.isTTY && process.stderr.isTTY);
try {
  await runRestore({
    appDir,
    env: process.env,
    callerCwd: cwd,
    archive: command.archive,
    databaseUrl: command.databaseUrl,
    withSettings: command.withSettings,
    yes: command.yes,
    passphrase: async () => {
      try {
        return await readPassphrase({
          file: command.passphraseFile,
          env: process.env,
          callerCwd: cwd,
          confirm: false,
          ask: terminal
            ? async (message) => {
                const answer = await p.password({ message, output: process.stderr });
                return p.isCancel(answer) ? null : answer;
              }
            : undefined,
        });
      } catch (error) {
        if (!(error instanceof PassphraseError)) throw error;
        console.error(`✗ ${error.message}`);
        process.exit(error.exitCode);
      }
    },
    confirm: terminal
      ? async (message) => {
          const answer = await p.confirm({ message, initialValue: false, output: process.stderr });
          return answer === true;
        }
      : undefined,
    log: {
      info: (message) => console.log(message),
      warn: (message) => console.warn(`! ${message}`),
    },
  });
} catch (error) {
  if (!(error instanceof RestoreFailedError)) throw error;
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
