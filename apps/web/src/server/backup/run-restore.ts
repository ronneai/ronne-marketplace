import { createReadStream, existsSync, writeFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { parseEnv } from "node:util";
import { type Kysely, sql } from "kysely";
import { envFilePath } from "../config";
import { createDb, openSqliteReadOnly } from "../db/create-db";
import { MIGRATION_LOCK_TABLE, migrateToLatest } from "../db/migrate";
import { migrations } from "../db/migrations";
import type { Database } from "../db/schema";
import { parseDatabaseUrl } from "../db/url";
import { recordAudit } from "../domains/audit/actions/audit";
import { defaultDataPath, runtimeOf, scriptCommand } from "../runtime";
import { generateAuthSecret, mergeEnv } from "../setup/env-file";
import { ContainerError } from "./crypto";
import { isEmptyDatabase, RestoreError, restoreArchive } from "./restore";
import type { BackupLog } from "./run-backup";
import { type VerifyResult, verifyArchive } from "./verify";

type Env = Record<string, string | undefined>;

/** The restore didn't happen or didn't finish; the message says what was left. */
export class RestoreFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreFailedError";
  }
}

const DIALECTS = { sqlite: "SQLite", postgres: "PostgreSQL", mysql: "MySQL or MariaDB" } as const;

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const codeOf = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code;

/** How to start the instance once restored, where it runs. */
const startHint = (env: Env) => {
  const runtime = runtimeOf(env);
  if (runtime === "docker") return "docker compose start web";
  if (runtime === "npm")
    return env.RONNE_SERVICE === "1" ? "sudo rmk-server service start" : "rmk-server";
  return "pnpm dev, or pnpm start after pnpm build";
};

/**
 * `rmk-server restore <archive>` (099), the steps of SPEC.md "### `rmk-server restore`": verify
 * the whole archive, choose the target database and storage, refuse unless both are empty, then
 * restore on one connection that holds the migration lock (a server starting meanwhile waits), run
 * the newer migrations, record `instance.restored`, and write the settings file or say what
 * differs. Nothing is written before every check has passed.
 */
export const runRestore = async (options: {
  appDir: string;
  env: Env;
  callerCwd: string;
  archive: string;
  databaseUrl?: string;
  withSettings: boolean;
  yes: boolean;
  /** Asked only when the archive is encrypted. */
  passphrase: () => Promise<Buffer>;
  /** A yes/no question in a terminal; absent without one. */
  confirm?: (message: string) => Promise<boolean>;
  log: BackupLog;
  /** Called once the target is locked, before it's checked; tests try to write to it there. */
  onLocked?: () => Promise<void>;
}): Promise<{ rows: number; files: number; newer: string[] }> => {
  const { appDir, env, log } = options;
  const archive = resolve(options.callerCwd, options.archive);
  try {
    if (!(await stat(archive)).isFile()) throw new RestoreFailedError(`${archive} isn't a file.`);
  } catch (error) {
    if (error instanceof RestoreFailedError) throw error;
    throw new RestoreFailedError(`${archive} couldn't be read (${codeOf(error) ?? "an error"}).`);
  }

  // The passphrase once, for both reads.
  let passphrase: Buffer | undefined;
  const askPassphrase = async () => {
    passphrase ??= await options.passphrase();
    return passphrase;
  };

  // 1-2. The whole archive, checked, and migrations this app has.
  let verified: VerifyResult;
  try {
    verified = await verifyArchive({
      source: createReadStream(archive, { highWaterMark: 1024 * 1024 }),
      passphrase: askPassphrase,
      knownMigrations: Object.keys(migrations),
      keepSettings: true,
    });
  } catch (error) {
    if (error instanceof ContainerError || (error as Error)?.name === "VerifyError")
      throw new RestoreFailedError(`${(error as Error).message} Nothing was changed.`);
    throw error;
  }
  const { info, manifest } = verified;
  const backupSettings: Env = verified.settings ? parseEnv(verified.settings.toString("utf8")) : {};
  if (options.withSettings && !verified.settings)
    throw new RestoreFailedError(
      "--with-settings: this backup has no settings file (it was made with --no-settings). Nothing was changed.",
    );

  // 3-4. The target database and storage, as the current settings or the defaults say.
  const envFile = envFilePath(appDir, env);
  let currentText: string | null = null;
  try {
    currentText = await readFile(envFile, "utf8");
  } catch (error) {
    if (codeOf(error) !== "ENOENT")
      throw new RestoreFailedError(
        `The settings file couldn't be read (${codeOf(error) ?? "an error"}). Nothing was changed: run it as the account that runs the server.`,
      );
  }
  const current: Env = currentText === null ? {} : parseEnv(currentText);
  const setting = (key: string) => env[key] || current[key] || undefined;
  const databaseUrl =
    options.databaseUrl ||
    setting("DATABASE_URL") ||
    (options.withSettings && currentText === null ? backupSettings.DATABASE_URL : undefined) ||
    `file:${defaultDataPath("ronne.db", env)}`;
  const storagePath = setting("STORAGE_PATH") ?? defaultDataPath("storage", env);
  const storageRoot = resolve(appDir, storagePath);
  try {
    const entries = existsSync(storageRoot) ? await readdir(storageRoot) : [];
    if (entries.length > 0)
      throw new RestoreFailedError(
        `The storage folder ${storageRoot} isn't empty. Restore into an empty one (STORAGE_PATH), or move this one aside first. Nothing was changed.`,
      );
  } catch (error) {
    if (error instanceof RestoreFailedError) throw error;
    throw new RestoreFailedError(
      `The storage folder ${storageRoot} couldn't be looked at (${codeOf(error) ?? "an error"}). Nothing was changed.`,
    );
  }

  if (manifest.missingArtifacts.length > 0) {
    const what = `${count(manifest.missingArtifacts.length, "released version")} ${manifest.missingArtifacts.length === 1 ? "has" : "have"} no artifact in this backup (missing from storage when it was made), so ${manifest.missingArtifacts.length === 1 ? "it" : "they"} will answer artifact_unavailable`;
    if (!options.yes) {
      if (!options.confirm)
        throw new RestoreFailedError(
          `${what}. Run it again with --yes to restore anyway. Nothing was changed.`,
        );
      if (!(await options.confirm(`${what}. Restore anyway?`)))
        throw new RestoreFailedError("Cancelled. Nothing was changed.");
    } else log.warn(`${what}.`);
  }

  // 5-6. The restore itself, on one connection holding the migration lock.
  // Named by its kind, never by its URL, which comes from the settings or the environment and can
  // hold a password (CodeQL's clear-text logging rule, docs/knowledge/codeql-logging.md).
  const notEmpty = (kind: string, sqlite: boolean) =>
    new RestoreFailedError(
      `The ${kind} database isn't empty. Restore into a new database, or remove this one first${sqlite ? " (stop the server and move the .db file, with its -wal and -shm files, aside)" : ""}. Nothing was changed.`,
    );
  const busy = () =>
    new RestoreFailedError(
      "The SQLite database is in use by another process (the server, or another restore). Stop it, then run this again. Nothing was changed.",
    );
  // A SQLite file that's there is looked at read-only first: opening it to restore turns WAL on,
  // which would change a file that turns out not to be empty.
  try {
    const target = parseDatabaseUrl(databaseUrl, appDir);
    if (
      target.dialect === "sqlite" &&
      target.filename !== ":memory:" &&
      existsSync(target.filename)
    ) {
      const look = openSqliteReadOnly(target.filename);
      try {
        if (!(await isEmptyDatabase(look, "sqlite"))) throw notEmpty("SQLite", true);
      } finally {
        await look.destroy();
      }
    }
  } catch (error) {
    if (error instanceof RestoreFailedError) throw error;
    if (codeOf(error) === "SQLITE_BUSY") throw busy();
    throw new RestoreFailedError(
      `The target database couldn't be opened: ${(error as Error).message.replace(/\.$/, "")}. Nothing was changed.`,
    );
  }
  let created: ReturnType<typeof createDb>;
  try {
    created = createDb(databaseUrl, { baseDir: appDir });
  } catch (error) {
    if (codeOf(error) === "SQLITE_BUSY") throw busy();
    throw new RestoreFailedError(
      `The target database couldn't be opened: ${(error as Error).message.replace(/\.$/, "")}. Nothing was changed.`,
    );
  }
  const { db, dialect } = created;
  const shown = `the ${DIALECTS[dialect]} database`;
  let result: { rows: number; files: number; newer: string[] };
  // Set once the restore may have written: before that, a failure has changed nothing.
  let writing = false;
  try {
    result = await db.connection().execute(async (connection) => {
      const conn = connection as unknown as Kysely<unknown>;
      const adapter = connection.getExecutor().adapter;
      const lock = { lockTable: MIGRATION_LOCK_TABLE, lockRowId: "migration_lock" };
      if (dialect !== "sqlite") await adapter.acquireMigrationLock(conn, lock);
      else {
        // SQLite has no migration lock (Kysely's does nothing there): the file is locked whole
        // instead, for as long as this connection is open, so no server or other restore writes
        // to it between the emptiness check and the end.
        try {
          await sql`pragma locking_mode = exclusive`.execute(conn);
          await sql`begin immediate`.execute(conn);
          await sql`commit`.execute(conn);
        } catch (error) {
          if (codeOf(error) === "SQLITE_BUSY") throw busy();
          throw error;
        }
      }
      try {
        await options.onLocked?.();
        if (!(await isEmptyDatabase(conn, dialect)))
          throw notEmpty(DIALECTS[dialect], dialect === "sqlite");
        writing = true;
        const restored = await restoreArchive({
          db: conn,
          dialect,
          verified,
          source: () => createReadStream(archive, { highWaterMark: 1024 * 1024 }),
          ...(passphrase ? { passphrase } : {}),
          storageRoot,
        });
        let newer: string[];
        try {
          newer = await migrateToLatest(conn, dialect);
        } catch (error) {
          throw new RestoreError(
            `The rows and files are restored, but a newer migration failed: ${(error as Error).message}`,
            true,
          );
        }
        await recordAudit(conn as unknown as Kysely<Database>, dialect, {
          actorId: null,
          action: "instance.restored",
          target: { type: "instance", id: null },
          metadata: {
            via: "cli",
            from: { version: info.ronne, dialect: info.dialect, time: info.createdAt },
            rows: restored.rows,
            files: restored.files,
          },
        });
        return { rows: restored.rows, files: restored.files, newer };
      } finally {
        if (dialect !== "sqlite")
          await adapter.releaseMigrationLock(conn, lock).catch(() => undefined);
      }
    });
  } catch (error) {
    if (error instanceof RestoreFailedError) throw error;
    if (error instanceof RestoreError) {
      if (!error.wrote) throw new RestoreFailedError(`${error.message} Nothing was changed.`);
      throw new RestoreFailedError(
        `${error.message} It left ${shown} partly restored, and maybe files in the storage folder: empty both before trying again.`,
      );
    }
    throw new RestoreFailedError(
      `${shown.replace(/^t/, "T")} couldn't be restored: ${(error as Error).message.replace(/\.$/, "")}. ${writing ? "If anything was written, empty it before trying again." : "Nothing was changed."}`,
    );
  } finally {
    await db.destroy();
  }

  // 7. The settings: the backup's when asked and there are none; otherwise what differs.
  const tables = Object.keys(manifest.tables).length;
  log.info(
    `Restored ${count(result.rows, "row")} in ${count(tables, "table")} and ${count(result.files, "stored file")} from ${basename(archive)} (made by Ronne ${info.ronne} at ${info.createdAt} from ${DIALECTS[info.dialect]}) into ${shown}.`,
  );
  if (result.newer.length > 0)
    log.info(
      `Applied ${count(result.newer.length, "newer migration")}: ${result.newer.join(", ")}.`,
    );
  // The same database however it's written (a SQLite file by its path).
  const sameDatabase = (a: string | undefined, b: string) => {
    if (a === undefined) return false;
    try {
      const x = parseDatabaseUrl(a, appDir);
      const y = parseDatabaseUrl(b, appDir);
      return x.dialect === "sqlite" && y.dialect === "sqlite" ? x.filename === y.filename : a === b;
    } catch {
      return a === b;
    }
  };
  /** The settings file as it is now, not as it was when the restore started. */
  const readNow = async (): Promise<string | null> => {
    try {
      return await readFile(envFile, "utf8");
    } catch (error) {
      if (codeOf(error) === "ENOENT") return null;
      throw error;
    }
  };
  /**
   * Creates the settings file, never replacing one: an exclusive create (`wx`), which fails if a
   * file (or a link) is there, works on every file system, and makes it 0600 from the start.
   */
  const createSettings = async (content: string): Promise<boolean> => {
    try {
      writeFileSync(envFile, content, { flag: "wx", mode: 0o600 });
      return true;
    } catch (error) {
      if (codeOf(error) === "EEXIST") return false;
      throw error;
    }
  };
  const appeared = () =>
    log.warn(
      "A settings file appeared while the restore ran, so it was kept: check that its DATABASE_URL and STORAGE_PATH are the restored ones.",
    );
  try {
    const nowText = await readNow();
    if (currentText !== null && nowText === null) {
      log.warn(
        "The settings file was removed while the restore ran, and none was written: run the restore's settings step by hand, or run setup.",
      );
    } else if (currentText === null && nowText !== null) {
      appeared();
    } else if (currentText === null) {
      const targets = { DATABASE_URL: databaseUrl, STORAGE_PATH: storagePath };
      if (options.withSettings && verified.settings) {
        if (
          await createSettings(
            mergeEnv(verified.settings.toString("utf8"), targets, { replaceKept: true }),
          )
        )
          log.info("Wrote the backup's settings file, with this database and storage.");
        else appeared();
      } else if (
        await createSettings(
          mergeEnv("", {
            ...targets,
            AUTH_SECRET: generateAuthSecret(),
            ...(backupSettings.PUBLIC_URL ? { PUBLIC_URL: backupSettings.PUBLIC_URL } : {}),
          }),
        )
      )
        log.warn(
          "Wrote a settings file with a new AUTH_SECRET (not the backup's: run with --with-settings for that), so everyone signs in again.",
        );
      else appeared();
    } else {
      // What the server will read: the file as it is now, under the environment.
      const now: Env = parseEnv(nowText ?? "");
      const setting = (key: string) => env[key] || now[key] || undefined;
      if (options.withSettings)
        log.info("--with-settings: a settings file is here already, so it was kept.");
      // The server reads these: if they name other places, it won't open what was restored.
      if (!sameDatabase(setting("DATABASE_URL"), databaseUrl))
        log.warn(
          "The settings name another database than the one restored into: change DATABASE_URL (in the settings file or the environment) before starting the server.",
        );
      if (
        resolve(appDir, setting("STORAGE_PATH") ?? defaultDataPath("storage", env)) !== storageRoot
      )
        log.warn(
          "The settings name another storage folder than the restored one: change STORAGE_PATH.",
        );
      if (backupSettings.AUTH_SECRET && backupSettings.AUTH_SECRET !== setting("AUTH_SECRET"))
        log.warn(
          "AUTH_SECRET differs from the backup's: everyone will need to sign in again. The settings file was kept.",
        );
      if (backupSettings.PUBLIC_URL && backupSettings.PUBLIC_URL !== setting("PUBLIC_URL"))
        log.warn(
          `PUBLIC_URL differs from the backup's (${backupSettings.PUBLIC_URL}). The settings file was kept.`,
        );
    }
  } catch (error) {
    throw new RestoreFailedError(
      `The data is restored, but the settings file couldn't be written (${codeOf(error) ?? (error as Error).message}). Write it by hand, or run \`${scriptCommand("setup", env)}\`.`,
    );
  }
  log.info(`Next, start the server: ${startHint(env)}.`);
  return result;
};
