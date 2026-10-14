import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { migrations } from "../db/migrations";
import { ContainerError } from "./crypto";
import type { BackupLog } from "./run-backup";
import { formatBytes } from "./run-backup";
import { type VerifyResult, verifyArchive } from "./verify";

/** The archive can't be read or doesn't pass; the message says why. */
export class VerifyFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyFailedError";
  }
}

const DIALECTS = { sqlite: "SQLite", postgres: "PostgreSQL", mysql: "MySQL or MariaDB" } as const;

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * `backup --verify <archive>` (099): reads the archive (relative to where the command was typed),
 * runs every check, and says what's in it. Needs no database or settings: it reads only the file.
 * `passphrase` is asked only when the archive is encrypted.
 */
export const runVerify = async (options: {
  archive: string;
  callerCwd: string;
  passphrase: () => Promise<Buffer>;
  log: BackupLog;
}): Promise<VerifyResult> => {
  const path = resolve(options.callerCwd, options.archive);
  try {
    if (!(await stat(path)).isFile()) throw new VerifyFailedError(`${path} isn't a file.`);
  } catch (error) {
    if (error instanceof VerifyFailedError) throw error;
    throw new VerifyFailedError(
      `${path} couldn't be read (${(error as NodeJS.ErrnoException).code ?? "an error"}).`,
    );
  }
  let result: VerifyResult;
  try {
    result = await verifyArchive({
      source: createReadStream(path, { highWaterMark: 1024 * 1024 }),
      passphrase: options.passphrase,
      knownMigrations: Object.keys(migrations),
    });
  } catch (error) {
    if (error instanceof ContainerError) throw new VerifyFailedError(error.message);
    if ((error as Error)?.name === "VerifyError")
      throw new VerifyFailedError((error as Error).message);
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code) throw new VerifyFailedError(`${path} couldn't be read (${code}).`);
    throw error;
  }
  const { info, manifest, encrypted } = result;
  const tables = Object.values(manifest.tables);
  const rows = tables.reduce((sum, t) => sum + t.rows, 0);
  options.log.info(
    `${basename(path)} is complete: every checksum matches${manifest.missingArtifacts.length === 0 ? ", and every released version's artifact is in it" : ""}.`,
  );
  options.log.info(
    `Made by Ronne ${info.ronne} at ${info.createdAt} from ${DIALECTS[info.dialect]}, ${count(info.migrations.length, "migration")} applied${encrypted ? ", encrypted" : ""} (${formatBytes(result.bytes)}).`,
  );
  options.log.info(
    `${count(rows, "row")} in ${count(tables.length, "table")}, ${count(manifest.storage.files, "stored file")} (${formatBytes(manifest.storage.bytes)}), ${manifest.settings.included ? "with the settings file" : "without the settings file"}.`,
  );
  if (manifest.settings.environmentOnly.length > 0)
    options.log.warn(
      `Not in it, as they came from the environment: ${manifest.settings.environmentOnly.join(", ")}.`,
    );
  if (manifest.missingArtifacts.length > 0) {
    const shown = manifest.missingArtifacts.slice(0, 10).map((a) => `${a.item} ${a.version}`);
    const more = manifest.missingArtifacts.length - shown.length;
    options.log.warn(
      `${count(manifest.missingArtifacts.length, "released version")} had no artifact in storage when it was made, so ${manifest.missingArtifacts.length === 1 ? "it isn't" : "they aren't"} in it: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`,
    );
  }
  return result;
};
