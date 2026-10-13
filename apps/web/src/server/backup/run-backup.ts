import { existsSync, unlinkSync } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseEnv } from "node:util";
import { type Kysely, sql } from "kysely";
import { version as RONNE_VERSION } from "../../../package.json";
import { envFilePath } from "../config";
import { createDb } from "../db/create-db";
import type { DumpOptions } from "../db/dump";
import { parseDatabaseUrl } from "../db/url";
import { recordAudit } from "../domains/audit/actions/audit";
import { defaultDataPath, runtimeOf, scriptCommand } from "../runtime";
import { type BackupArchiveResult, type MissingArtifact, writeBackupArchive } from "./archive";
import { createSealer, deriveKey, newHeader } from "./crypto";

type Env = Record<string, string | undefined>;

/** What the command says, line by line: plain text, for a terminal or a schedule's log. */
export type BackupLog = { info: (message: string) => void; warn: (message: string) => void };

/** Where the archive's bytes go. `openFileOutput` is the real one; tests pass their own. */
export type BackupOutput = {
  write: (chunk: Uint8Array) => Promise<void>;
  /** Flushes to the disk, before the archive gets its final name. */
  sync: () => Promise<void>;
  close: () => Promise<void>;
};
export type OpenOutput = (path: string) => Promise<BackupOutput>;

/** The backup didn't complete; the message says why and what was left (nothing). */
export class BackupFailedError extends Error {
  constructor(message: string, options?: { cause: unknown }) {
    super(message, options);
    this.name = "BackupFailedError";
  }
}

/** The settings the server reads, which a backup's settings file should hold. */
const SETTINGS = ["DATABASE_URL", "AUTH_SECRET", "PUBLIC_URL", "STORAGE_PATH", "TRUST_PROXY"];

/**
 * The folder a relative `--out` starts from. In Docker, where the command was typed: the image's
 * `pnpm` stand-in sets RONNE_CALLER_CWD before moving to the app. In a clone, pnpm's INIT_CWD: the
 * folder of the package whose script ran (the repository's root for `pnpm run backup`), since
 * pnpm's script shell and tsx both reset PWD to the app's folder, and nothing keeps where it was
 * typed. `rmk-server` makes `--out` absolute before the script runs.
 */
export const callerCwd = (env: Env, cwd: string = process.cwd()): string =>
  env.RONNE_CALLER_CWD || env.INIT_CWD || cwd;

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it escapes.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** A name as it can be shown in a terminal: control characters escaped, so none can act on it. */
const printable = (name: string) =>
  name.replace(CONTROL, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);

/** An archive's name: `ronne-backup-<UTC yyyymmdd-hhmmss>.tar`, `.tar.enc` when encrypted. */
export const ARCHIVE_NAME = /^ronne-backup-\d{8}-\d{6}\.tar(?:\.enc)?$/;

export const archiveName = (at: Date, encrypted = false): string => {
  const iso = at.toISOString();
  const stamp = `${iso.slice(0, 10).replaceAll("-", "")}-${iso.slice(11, 19).replaceAll(":", "")}`;
  return `ronne-backup-${stamp}.tar${encrypted ? ".enc" : ""}`;
};

/** Writes into a file created for it (never an existing one), mode 0600. */
export const openFileOutput: OpenOutput = async (path) => {
  const handle = await open(path, "wx", 0o600);
  return {
    write: async (chunk) => {
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
        offset += bytesWritten;
      }
    },
    sync: () => handle.sync(),
    close: () => handle.close(),
  };
};

/** The tar writer's many small writes (headers, padding) gathered into fewer, larger ones. */
const BUFFER_BYTES = 1024 * 1024;
const buffered = (output: BackupOutput) => {
  let pending: Uint8Array[] = [];
  let size = 0;
  const flush = async () => {
    if (size === 0) return;
    const chunk = pending.length === 1 ? (pending[0] as Uint8Array) : Buffer.concat(pending, size);
    pending = [];
    size = 0;
    await output.write(chunk);
  };
  return {
    write: async (chunk: Uint8Array) => {
      if (chunk.length >= BUFFER_BYTES) {
        await flush();
        await output.write(chunk);
        return;
      }
      // A copy: the caller may reuse its buffer once this call returns.
      pending.push(Uint8Array.from(chunk));
      size += chunk.length;
      if (size >= BUFFER_BYTES) await flush();
    },
    flush,
  };
};

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
export const formatBytes = (bytes: number): string =>
  bytes >= GIB
    ? `${(bytes / GIB).toFixed(1)} GiB`
    : bytes >= MIB
      ? `${(bytes / MIB).toFixed(1)} MiB`
      : bytes >= 1024
        ? `${Math.round(bytes / 1024)} KiB`
        : `${bytes} B`;

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const listed = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** Up to 10 artifacts, named, and how many more. */
const artifactList = (artifacts: MissingArtifact[]) => {
  const shown = artifacts.slice(0, 10).map((a) => `${a.item} ${a.version} (${a.path})`);
  const more = artifacts.length - shown.length;
  return `${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
};

/** The path with every link resolved, for the part that exists yet. */
const realOf = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(path) === path) throw error;
    return join(await realOf(dirname(path)), basename(path));
  }
};

/**
 * Whether `child` is `parent` or under it, as written. Both should be real paths (`realpath`):
 * the disk then says how it spells them, whatever case or Unicode form it ignores.
 */
const isInside = (child: string, parent: string) => {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
};

const codeOf = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code;

/** Why a backup stopped, in words, for an error the file system or the database gave. */
const failure = (error: unknown): string => {
  const code = codeOf(error);
  if (code === "ENOSPC" || code === "EDQUOT")
    return `the disk is full (${code}). Free some space, or choose another folder with --out`;
  if (code === "EACCES" || code === "EPERM" || code === "EROFS")
    return `a file couldn't be read or written (${code}). Run it as the account that runs the server`;
  if (code === "EMFILE" || code === "ENFILE") return `too many open files (${code})`;
  const message = error instanceof Error ? error.message : String(error);
  return `${message.replace(/\.$/, "")}${code && !message.includes(code) ? ` (${code})` : ""}`;
};

export type BackupResult = {
  path: string;
  bytes: number;
  archive: BackupArchiveResult;
  removed: string[];
};

/**
 * pnpm run backup / rmk-server backup (099): one archive of the whole instance while it runs, in
 * `out` (relative to `callerCwd`) or the data folder's `backups/`. The archive is written as
 * `<name>.partial`, flushed to disk, then renamed: a schedule that copies the folder never takes a
 * half-written archive, and a failed backup removes its partial file and leaves the folder as it
 * was (`--keep` doesn't run). Recorded as `instance.backup_made` once complete.
 */
export const runBackup = async (options: {
  appDir: string;
  env: Env;
  /** Where the person ran the command: `--out` is relative to it. */
  callerCwd: string;
  out?: string;
  settings: boolean;
  keep?: number;
  log: BackupLog;
  now?: () => Date;
  openOutput?: OpenOutput;
  dump?: DumpOptions;
  /**
   * The command's own process: on Ctrl-C or SIGTERM (a schedule's time limit, a service stopping)
   * while the archive is written, remove the partial file, then exit 130 or 143.
   */
  removeOnSignal?: boolean;
  /**
   * `--encrypt`: the passphrase, in the format's bytes (`passphrase.ts`). The archive is then the
   * encrypted container, `.tar.enc`. Never printed or logged.
   */
  passphrase?: Buffer;
}): Promise<BackupResult> => {
  const { appDir, env, log } = options;
  const now = options.now ?? (() => new Date());
  const started = now();
  // The settings file, read once: the settings the backup runs with and the copy in the archive
  // are the same text. Environment variables win over it, as the server reads them (config.ts).
  const envFile = envFilePath(appDir, env);
  // As bytes: the archive holds the file as it is, even a byte that isn't UTF-8.
  let settingsBytes: Buffer | null = null;
  try {
    settingsBytes = await readFile(envFile);
  } catch (error) {
    if (codeOf(error) !== "ENOENT")
      // Its message names the file; the code is enough (rotate-secret.ts does the same).
      throw new BackupFailedError(
        `The settings file couldn't be read (${codeOf(error) ?? "an error"}). Nothing was written: run it as the account that runs the server.`,
      );
  }
  const file: Env = settingsBytes === null ? {} : parseEnv(settingsBytes.toString("utf8"));
  const setting = (key: string) => env[key] || file[key] || undefined;
  const config = {
    databaseUrl: setting("DATABASE_URL"),
    storagePath: setting("STORAGE_PATH") ?? defaultDataPath("storage", env),
  };
  if (!config.databaseUrl)
    throw new BackupFailedError(
      `This instance isn't set up yet, so there's nothing to back up. Run \`${scriptCommand("setup", env)}\` first.`,
    );
  const databaseUrl = config.databaseUrl;

  // STORAGE_PATH names a folder: `./data/storage` and `data/storage/` are the same one.
  const same = (key: string, a: string, b: string | undefined) =>
    b !== undefined &&
    (key === "STORAGE_PATH" ? resolve(appDir, a) === resolve(appDir, b) : a === b);
  const environmentOnly = SETTINGS.filter(
    (key) => env[key] && !same(key, env[key] as string, file[key]),
  );

  const storageRoot = resolve(appDir, config.storagePath);
  const outDir = options.out
    ? resolve(options.callerCwd, options.out)
    : resolve(appDir, defaultDataPath("backups", env));
  // A backup in storage would be in the next backup, and the next. Checked now for what exists,
  // and again once the folder is made (below), when the disk can say how it spells every part.
  let realOut: string;
  let realStorage: string;
  try {
    [realOut, realStorage] = await Promise.all([realOf(outDir), realOf(storageRoot)]);
  } catch (error) {
    throw new BackupFailedError(
      `${outDir} or the storage folder can't be looked at: ${failure(error)}. Nothing was written.`,
    );
  }
  if (isInside(realOut, realStorage))
    throw new BackupFailedError(
      `${outDir} is inside the storage folder, so each backup would hold the ones before it. Choose another folder with --out.`,
    );

  const encrypted = options.passphrase !== undefined;
  const name = archiveName(started, encrypted);
  const path = join(outDir, name);
  const partial = `${path}.partial`;
  const exists = async (p: string) =>
    lstat(p).then(
      () => true,
      (error) => (codeOf(error) === "ENOENT" ? false : Promise.reject(error)),
    );
  const taken = await exists(path).catch((error: unknown) => {
    throw new BackupFailedError(
      `${path} can't be looked at: ${failure(error)}. Nothing was written.`,
    );
  });
  if (taken) throw new BackupFailedError(`${path} already exists. Wait a second and run it again.`);

  // Before the archive's file exists, so a database that can't be opened leaves nothing behind.
  let created: ReturnType<typeof createDb>;
  try {
    // Opening a SQLite file that isn't there would make an empty one (and its folder).
    const target = parseDatabaseUrl(databaseUrl, appDir);
    if (
      target.dialect === "sqlite" &&
      target.filename !== ":memory:" &&
      !existsSync(target.filename)
    )
      throw new BackupFailedError(
        "The settings name a SQLite database file that isn't there. Nothing was written: check DATABASE_URL.",
      );
    created = createDb(databaseUrl, { baseDir: appDir });
  } catch (error) {
    if (error instanceof BackupFailedError) throw error;
    // The error shows the URL without its password (url.ts).
    throw new BackupFailedError(
      `The database couldn't be opened: ${failure(error)}. Nothing was written.`,
    );
  }
  const { db, dialect } = created;
  // PostgreSQL's and MySQL's pools connect at the first query: reach the server now, so one that
  // can't be reached or refuses the password leaves no file either.
  try {
    await sql`select 1`.execute(db);
  } catch (error) {
    await db.destroy().catch(() => undefined);
    throw new BackupFailedError(
      `The database couldn't be opened: ${failure(error)}. Nothing was written.`,
    );
  }

  // Made, then checked again: a storage folder that wasn't there before and is now was made by
  // this mkdir, or by someone else meanwhile: both now exist, and the real paths the disk gives say
  // which, however either was spelled.
  let made: string | undefined;
  // The folders this backup made, removed when it fails (only empty ones, from the deepest up).
  const removeMade = async () => {
    for (let dir = outDir; made && isInside(dir, made); dir = dirname(dir)) {
      await rmdir(dir).catch(() => undefined);
      if (dir === made) break;
    }
  };
  try {
    made = await mkdir(outDir, { recursive: true, mode: 0o700 });
    const inside =
      existsSync(storageRoot) && isInside(await realpath(outDir), await realpath(storageRoot));
    if (inside)
      throw new BackupFailedError(
        `${outDir} is inside the storage folder, so each backup would hold the ones before it. Choose another folder with --out.`,
      );
  } catch (error) {
    await removeMade();
    await db.destroy().catch(() => undefined);
    if (error instanceof BackupFailedError) throw error;
    throw new BackupFailedError(
      `The folder ${outDir} couldn't be made: ${failure(error)}. Nothing was written.`,
    );
  }

  // The key before the file: scrypt takes a moment and much memory, and its failure leaves nothing.
  let sealing: { header: ReturnType<typeof newHeader>; key: Buffer } | null = null;
  if (options.passphrase) {
    try {
      const header = newHeader();
      sealing = { header, key: await deriveKey(options.passphrase, header) };
    } catch (error) {
      await removeMade();
      await db.destroy().catch(() => undefined);
      throw new BackupFailedError(
        `The encryption key couldn't be made: ${failure(error)}. Nothing was written.`,
      );
    }
  }

  let output: BackupOutput;
  try {
    output = await (options.openOutput ?? openFileOutput)(partial);
  } catch (error) {
    await removeMade();
    await db.destroy().catch(() => undefined);
    throw new BackupFailedError(
      codeOf(error) === "EEXIST"
        ? `${partial} already exists: another backup is being written there. Wait for it, or remove that file if none is running.`
        : `The archive couldn't be created in ${outDir}: ${failure(error)}.`,
    );
  }

  const onSignal = (signal: NodeJS.Signals) => {
    try {
      unlinkSync(partial);
    } catch {
      // Already gone.
    }
    log.warn(`Stopped (${signal}): the partial archive was removed.`);
    process.exit(signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143);
  };
  const signals: NodeJS.Signals[] = options.removeOnSignal ? ["SIGINT", "SIGTERM", "SIGHUP"] : [];
  for (const signal of signals) process.once(signal, onSignal);
  try {
    let archive: BackupArchiveResult;
    let bytes = 0;
    try {
      const sink = buffered(output);
      const toFile = async (chunk: Uint8Array) => {
        bytes += chunk.length;
        await sink.write(chunk);
      };
      // Encrypted: the tar goes through the sealer, and the file holds the container.
      const sealer = sealing ? createSealer(sealing.key, sealing.header, toFile) : null;
      archive = await writeBackupArchive({
        db: db as unknown as Kysely<unknown>,
        dialect,
        storageRoot,
        settings: options.settings ? settingsBytes : null,
        environmentOnly,
        version: RONNE_VERSION,
        now: () => started,
        dump: options.dump,
        write: (chunk) => (sealer ? sealer.push(chunk) : toFile(chunk)),
      });
      await sealer?.end();
      await sink.flush();
      await output.sync();
      await output.close();
      if (await exists(path)) throw new Error(`${path} appeared while the backup ran`);
      await rename(partial, path);
      for (const signal of signals) process.off(signal, onSignal);
    } catch (error) {
      for (const signal of signals) process.off(signal, onSignal);
      await output.close().catch(() => undefined);
      await unlink(partial).catch(() => undefined);
      await removeMade();
      throw new BackupFailedError(
        `The backup failed: ${failure(error)}. The partial archive was removed; nothing else changed.`,
        { cause: error },
      );
    }

    const { manifest } = archive;
    const tables = Object.values(manifest.tables);
    const rows = tables.reduce((sum, t) => sum + t.rows, 0);
    const seconds = (now().getTime() - started.getTime()) / 1000;
    log.info(`Wrote ${path} (${formatBytes(bytes)}) in ${seconds.toFixed(1)} s.`);
    log.info(
      `${count(rows, "row")} in ${count(tables.length, "table")}, ${count(manifest.storage.files, "stored file")} (${formatBytes(manifest.storage.bytes)}).`,
    );
    if (encrypted)
      log.warn(
        "It's encrypted: without the passphrase it can't be read, and a lost passphrase can't be recovered. Keep the passphrase somewhere other than the archive.",
      );
    if (manifest.settings.included)
      log.warn(
        `It holds the settings file, with AUTH_SECRET and the database's password: keep it as safe as the server itself${encrypted ? "" : ", and use --encrypt for copies that leave this machine"}.`,
      );
    else if (options.settings)
      log.warn("There's no settings file to back up: the settings come from the environment.");
    else log.info("The settings file isn't in it (--no-settings): keep a copy of it elsewhere.");
    if (environmentOnly.length > 0)
      log.warn(
        `${listed(environmentOnly)} ${environmentOnly.length === 1 ? "comes" : "come"} from the environment and ${environmentOnly.length === 1 ? "isn't" : "aren't"} in this backup${runtimeOf(env) === "docker" ? " (compose.yaml and the .env next to it set them: keep those too)" : ""}.`,
      );
    if (manifest.missingArtifacts.length > 0)
      log.warn(
        `${count(manifest.missingArtifacts.length, "released version")} ${manifest.missingArtifacts.length === 1 ? "has" : "have"} no artifact in storage, so the backup can't hold ${manifest.missingArtifacts.length === 1 ? "it" : "them"}: ${artifactList(manifest.missingArtifacts)}. The manifest lists them.`,
      );
    if (archive.alteredArtifacts.length > 0)
      log.warn(
        `In storage, the artifact of ${count(archive.alteredArtifacts.length, "released version")} has another sha256 than the database records (damaged on disk?): ${artifactList(archive.alteredArtifacts)}. Verifying this backup will report ${archive.alteredArtifacts.length === 1 ? "it" : "them"}.`,
      );
    for (const skipped of archive.skipped.slice(0, 10))
      log.warn(`Left out of the backup: storage/${printable(skipped.path)}, ${skipped.why}.`);
    if (archive.skipped.length > 10)
      log.warn(`… and ${archive.skipped.length - 10} more files left out of storage.`);

    try {
      await recordAudit(db, dialect, {
        actorId: null,
        action: "instance.backup_made",
        target: { type: "instance", id: null },
        metadata: {
          via: "cli",
          tables: tables.length,
          rows,
          files: manifest.storage.files,
          bytes,
          encrypted,
          settings: manifest.settings.included,
        },
      });
    } catch (error) {
      log.warn(
        `The backup is complete, but recording it in the audit log failed: ${failure(error)}.`,
      );
    }

    const removed =
      options.keep === undefined ? [] : await keepNewest(outDir, name, options.keep, log);
    return { path, bytes, archive, removed };
  } finally {
    await db.destroy();
  }
};

/**
 * `--keep n`: removes the oldest archives in `dir` beyond `n`, the new one counted and never
 * removed. Only regular files named `ronne-backup-<date>-<time>.tar` or `.tar.enc` count; the
 * names' UTC time orders them. A file that can't be removed is reported, and the rest still go.
 */
export const keepNewest = async (
  dir: string,
  newest: string,
  keep: number,
  log: BackupLog,
): Promise<string[]> => {
  const archives: string[] = [];
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    // The backup itself is complete: say why nothing was removed, and still succeed.
    log.warn(`--keep couldn't list ${dir}, so it removed nothing: ${failure(error)}.`);
    return [];
  }
  for (const name of names) {
    if (name === newest || !ARCHIVE_NAME.test(name)) continue;
    const info = await lstat(join(dir, name)).catch(() => null);
    if (info?.isFile()) archives.push(name);
  }
  // Newest first; `ronne-backup-<stamp>.tar` sorts before `.tar.enc` of the same second.
  archives.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const removed: string[] = [];
  for (const name of archives.slice(keep - 1)) {
    try {
      await unlink(join(dir, name));
      removed.push(name);
    } catch (error) {
      log.warn(`--keep couldn't remove ${name}: ${failure(error)}.`);
    }
  }
  if (removed.length > 0)
    log.info(`Removed ${count(removed.length, "older archive")} (--keep ${keep}).`);
  return removed;
};
