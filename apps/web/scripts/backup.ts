// pnpm run backup (099): one archive of the whole instance (database, storage, settings) while it
// runs. Asks nothing, but the passphrase for --encrypt in a terminal (schedules give it with
// --passphrase-file or RONNE_BACKUP_PASSPHRASE). `--verify <archive>` reads one and checks it.
// Exit codes: 0 the archive is complete, 1 failed (nothing left behind), 2 invalid input.
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { BACKUP_USAGE, parseBackupCommand } from "../src/server/backup/cli";
import { PassphraseError, readPassphrase } from "../src/server/backup/passphrase";
import { BackupFailedError, callerCwd, runBackup } from "../src/server/backup/run-backup";
import { runVerify, VerifyFailedError } from "../src/server/backup/run-verify";

const appDir = resolve(import.meta.dirname, "..");
const command = parseBackupCommand(process.argv.slice(2));

if (command.mode === "help") {
  console.log(BACKUP_USAGE);
  process.exit(0);
}
if (command.mode === "error") {
  console.error(`✗ ${command.message}\n\n${BACKUP_USAGE}`);
  process.exit(command.exitCode);
}

const cwd = callerCwd(process.env);
const log = {
  info: (message: string) => console.log(message),
  warn: (message: string) => console.warn(`! ${message}`),
};
const ask =
  process.stdin.isTTY && process.stderr.isTTY
    ? async (message: string) => {
        const answer = await p.password({ message, output: process.stderr });
        return p.isCancel(answer) ? null : answer;
      }
    : undefined;
/** The passphrase, or the process ends with what was wrong (never the passphrase). */
const passphraseFor = async (file: string | undefined, confirm: boolean) => {
  try {
    return await readPassphrase({ file, env: process.env, callerCwd: cwd, confirm, ask });
  } catch (error) {
    if (!(error instanceof PassphraseError)) throw error;
    console.error(`✗ ${error.message}`);
    process.exit(error.exitCode);
  }
};

if (command.mode === "verify") {
  try {
    await runVerify({
      archive: command.archive,
      callerCwd: cwd,
      // Asked only if the archive turns out to be encrypted.
      passphrase: () => passphraseFor(command.passphraseFile, false),
      log,
    });
  } catch (error) {
    if (!(error instanceof VerifyFailedError)) throw error;
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
  process.exit();
}

const passphrase = command.encrypt ? await passphraseFor(command.passphraseFile, true) : undefined;

try {
  await runBackup({
    appDir,
    env: process.env,
    callerCwd: cwd,
    passphrase,
    out: command.out,
    settings: command.settings,
    keep: command.keep,
    removeOnSignal: true,
    log,
  });
} catch (error) {
  if (!(error instanceof BackupFailedError)) throw error;
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
