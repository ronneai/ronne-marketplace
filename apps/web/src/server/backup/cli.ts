import { parseArgs } from "node:util";

export type BackupCommand =
  | {
      mode: "backup";
      out?: string;
      settings: boolean;
      keep?: number;
      encrypt: boolean;
      passphraseFile?: string;
    }
  | { mode: "verify"; archive: string; passphraseFile?: string }
  | { mode: "help" }
  | { mode: "error"; exitCode: 2; message: string };

/** The most archives `--keep` keeps: a bound, so a typo can't read as "keep everything". */
export const KEEP_MAX = 10_000;

export const BACKUP_USAGE = `Usage: backup [--out DIR] [--encrypt [--passphrase-file FILE]] [--no-settings] [--keep N]
       backup --verify ARCHIVE [--passphrase-file FILE]

Makes one archive with the database, the stored files and the settings file, while the server
runs: ronne-backup-<UTC date-time>.tar, in the data folder's backups/ unless --out says where.
With the settings, the archive holds AUTH_SECRET and the database's password: keep it as safe as
the server itself, and encrypt it before it leaves this machine.

  --out DIR       Where to write the archive (created with mode 0700); not inside storage
  --encrypt       Seal it with a passphrase (.tar.enc), asked twice, or from --passphrase-file or
                  RONNE_BACKUP_PASSPHRASE. A lost passphrase can't be recovered
  --passphrase-file FILE
                  Read the passphrase from FILE (one trailing line break is ignored)
  --verify ARCHIVE
                  Read an archive (decrypting it), check every checksum and every released
                  version's artifact, and say what's in it; nothing is restored or changed
  --no-settings   Leave the settings file out
  --keep N        Then remove the oldest ronne-backup-* archives in that folder beyond N (1 to ${KEEP_MAX})
  --yes, -y       Accepted for schedules; backup doesn't ask anything
  --help, -h      Show this`;

/** backup's flags (099). */
export const parseBackupCommand = (argv: string[]): BackupCommand => {
  const error = (message: string) => ({ mode: "error", exitCode: 2, message }) as const;
  let values: {
    out?: string;
    "no-settings"?: boolean;
    keep?: string;
    encrypt?: boolean;
    "passphrase-file"?: string;
    verify?: string;
    yes?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        out: { type: "string" },
        "no-settings": { type: "boolean" },
        keep: { type: "string" },
        encrypt: { type: "boolean" },
        "passphrase-file": { type: "string" },
        verify: { type: "string" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (caught) {
    return error((caught as Error).message);
  }
  if (values.help) return { mode: "help" };
  if (values.out !== undefined && values.out.trim() === "") return error("--out needs a folder.");
  if (values.verify !== undefined) {
    if (values.verify.trim() === "") return error("--verify needs an archive.");
    if (
      values.out !== undefined ||
      values.keep !== undefined ||
      values.encrypt ||
      values["no-settings"]
    )
      return error("--verify reads an archive; it takes only --passphrase-file.");
    if (values["passphrase-file"] !== undefined && values["passphrase-file"].trim() === "")
      return error("--passphrase-file needs a file.");
    return {
      mode: "verify",
      archive: values.verify,
      ...(values["passphrase-file"] !== undefined
        ? { passphraseFile: values["passphrase-file"] }
        : {}),
    };
  }
  if (values["passphrase-file"] !== undefined && !values.encrypt)
    return error("--passphrase-file goes with --encrypt or --verify.");
  if (values["passphrase-file"] !== undefined && values["passphrase-file"].trim() === "")
    return error("--passphrase-file needs a file.");
  let keep: number | undefined;
  if (values.keep !== undefined) {
    keep = /^\d+$/.test(values.keep) ? Number(values.keep) : Number.NaN;
    if (!(keep >= 1 && keep <= KEEP_MAX))
      return error(
        `--keep needs a whole number from 1 to ${KEEP_MAX} (how many archives to keep, this one included), not ${values.keep}.`,
      );
  }
  return {
    mode: "backup",
    ...(values.out !== undefined ? { out: values.out } : {}),
    settings: !values["no-settings"],
    ...(keep !== undefined ? { keep } : {}),
    encrypt: values.encrypt === true,
    ...(values["passphrase-file"] !== undefined
      ? { passphraseFile: values["passphrase-file"] }
      : {}),
  };
};

export type RestoreCommand =
  | {
      mode: "restore";
      archive: string;
      passphraseFile?: string;
      databaseUrl?: string;
      withSettings: boolean;
      yes: boolean;
    }
  | { mode: "help" }
  | { mode: "error"; exitCode: 2; message: string };

export const RESTORE_USAGE = `Usage: restore ARCHIVE [--passphrase-file FILE] [--database-url URL] [--with-settings] [--yes]

Restores a backup into an empty database and empty storage, on any of the three database kinds,
then runs the migrations this Ronne has since. Stop the server first. The archive is checked whole
before anything is written.

  --passphrase-file FILE  The passphrase of an encrypted archive (or RONNE_BACKUP_PASSPHRASE, or asked)
  --database-url URL      Restore into this database rather than the settings' (or a new SQLite file)
  --with-settings         With no settings file yet, write the backup's (with this database and
                          storage); otherwise a new one is written, with a new AUTH_SECRET
  --yes, -y               Don't ask (restore even when some released versions have no artifact)
  --help, -h              Show this`;

/** restore's flags (099): the archive, then options. */
export const parseRestoreCommand = (argv: string[]): RestoreCommand => {
  const error = (message: string) => ({ mode: "error", exitCode: 2, message }) as const;
  let values: {
    "passphrase-file"?: string;
    "database-url"?: string;
    "with-settings"?: boolean;
    yes?: boolean;
    help?: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        "passphrase-file": { type: "string" },
        "database-url": { type: "string" },
        "with-settings": { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (caught) {
    return error((caught as Error).message);
  }
  if (values.help) return { mode: "help" };
  if (positionals.length !== 1 || (positionals[0] as string).trim() === "")
    return error("Name one archive to restore.");
  for (const flag of ["passphrase-file", "database-url"] as const)
    if (values[flag] !== undefined && (values[flag] as string).trim() === "")
      return error(`--${flag} needs a value.`);
  return {
    mode: "restore",
    archive: positionals[0] as string,
    ...(values["passphrase-file"] !== undefined
      ? { passphraseFile: values["passphrase-file"] }
      : {}),
    ...(values["database-url"] !== undefined ? { databaseUrl: values["database-url"] } : {}),
    withSettings: values["with-settings"] === true,
    yes: values.yes === true,
  };
};

/**
 * Messages that can't be written (an output closed early, `… | head -1`, or a full disk under a
 * redirection) are lost, not the work: without this, the write's error would end a backup or a
 * restore part way (a restore after its data is in, before its settings file) with a crash.
 */
export const ignoreOutputErrors = (
  streams: NodeJS.EventEmitter[] = [process.stdout, process.stderr],
) => {
  for (const stream of streams) stream.on("error", () => undefined);
};
