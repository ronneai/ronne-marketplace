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
  | { mode: "help" }
  | { mode: "error"; exitCode: 2; message: string };

/** The most archives `--keep` keeps: a bound, so a typo can't read as "keep everything". */
export const KEEP_MAX = 10_000;

export const BACKUP_USAGE = `Usage: backup [--out DIR] [--encrypt [--passphrase-file FILE]] [--no-settings] [--keep N]

Makes one archive with the database, the stored files and the settings file, while the server
runs: ronne-backup-<UTC date-time>.tar, in the data folder's backups/ unless --out says where.
With the settings, the archive holds AUTH_SECRET and the database's password: keep it as safe as
the server itself, and encrypt it before it leaves this machine.

  --out DIR       Where to write the archive (created with mode 0700); not inside storage
  --encrypt       Seal it with a passphrase (.tar.enc), asked twice, or from --passphrase-file or
                  RONNE_BACKUP_PASSPHRASE. A lost passphrase can't be recovered
  --passphrase-file FILE
                  Read the passphrase from FILE (one trailing line break is ignored)
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
        yes: { type: "boolean", short: "y" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (caught) {
    return error((caught as Error).message);
  }
  if (values.help) return { mode: "help" };
  if (values.out !== undefined && values.out.trim() === "") return error("--out needs a folder.");
  if (values["passphrase-file"] !== undefined && !values.encrypt)
    return error("--passphrase-file goes with --encrypt.");
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
