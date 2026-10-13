// pnpm run backup (099): one archive of the whole instance (database, storage, settings) while it
// runs. Never asks anything, so schedules can run it as it is.
// Exit codes: 0 the archive is complete, 1 failed (nothing left behind), 2 invalid input.
import { resolve } from "node:path";
import { BACKUP_USAGE, parseBackupCommand } from "../src/server/backup/cli";
import { BackupFailedError, callerCwd, runBackup } from "../src/server/backup/run-backup";

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

try {
  await runBackup({
    appDir,
    env: process.env,
    callerCwd: callerCwd(process.env),
    out: command.out,
    settings: command.settings,
    keep: command.keep,
    removeOnSignal: true,
    log: {
      info: (message) => console.log(message),
      warn: (message) => console.warn(`! ${message}`),
    },
  });
} catch (error) {
  if (!(error instanceof BackupFailedError)) throw error;
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
}
