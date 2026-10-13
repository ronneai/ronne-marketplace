import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createTarWriter, isSafeTarPath } from "@ronneai/core/pack";
import { type Kysely, sql } from "kysely";
import { type DumpedTable, type DumpOptions, dumpTables } from "../db/dump";
import { readSchema } from "../db/introspect";
import { MIGRATION_TABLE } from "../db/migrate";
import { readSnapshot } from "../db/snapshot";
import type { DatabaseDialect } from "../db/url";
import { storageKeyProblem } from "../storage/storage-adapter";

/**
 * One backup archive (099), as `docs/spec/backup-format.md` writes it: `backup.json`, every table's
 * rows inside one snapshot, every storage file, the settings file and `manifest.json`, streamed
 * into `write` as a tar. Nothing here knows where the bytes go: `run-backup.ts` puts them in a file.
 */

/** The archive format this writes (`format` in `backup.json` and `manifest.json`). */
export const BACKUP_FORMAT = 1;

export type FileDigest = { size: number; sha256: string };

export type MissingArtifact = { item: string; version: string; path: string };

export type BackupManifest = {
  format: number;
  tables: Record<string, DumpedTable>;
  files: Record<string, FileDigest>;
  storage: { files: number; bytes: number };
  settings: { included: boolean; environmentOnly: string[] };
  missingArtifacts: MissingArtifact[];
};

export type BackupInfo = {
  format: number;
  ronne: string;
  createdAt: string;
  dialect: DatabaseDialect;
  migrations: string[];
};

export type BackupArchiveResult = {
  info: BackupInfo;
  manifest: BackupManifest;
  /** Released versions whose artifact is in storage with another sha256 than the database's. */
  alteredArtifacts: MissingArtifact[];
  /** Files under the storage path left out: links, in-progress writes' temporary files, odd names. */
  skipped: { path: string; why: string }[];
};

export type BackupArchiveOptions = {
  db: Kysely<unknown>;
  dialect: DatabaseDialect;
  /** The storage path, absolute. Absent or empty: no `storage/` entries. */
  storageRoot: string;
  /** The settings file's bytes, or null to leave `settings.env` out. */
  settings: Uint8Array | null;
  /** The settings that came only from the environment: names, never values. */
  environmentOnly: string[];
  /** Ronne's version, for `backup.json`. */
  version: string;
  /** Where the tar's bytes go, in order; it can wait (backpressure). */
  write: (chunk: Uint8Array) => Promise<void> | void;
  now?: () => Date;
  dump?: DumpOptions;
};

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A storage put's temporary file (`local-storage.ts`): `<key>.<12 hex>.tmp`, linked into place after. */
const IN_PROGRESS = /\.[0-9a-f]{12}\.tmp$/;

/**
 * Every regular file under `root`, as storage keys (`/` between segments), sorted in byte order
 * so two backups of the same storage list it alike. Links aren't followed, and a key a storage
 * put couldn't have written is left out and named.
 */
const storageFiles = async (
  root: string,
  skipped: BackupArchiveResult["skipped"],
): Promise<string[]> => {
  const keys: string[] = [];
  const walk = async (dir: string, prefix: string) => {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && prefix === "") return;
      throw error;
    }
    names.sort(byBytes);
    for (const name of names) {
      const key = prefix ? `${prefix}/${name}` : name;
      const info = await lstat(join(dir, name)).catch((error: NodeJS.ErrnoException) => {
        // Gone since the listing: a temporary file a put just removed.
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!info) continue;
      if (info.isDirectory()) await walk(join(dir, name), key);
      else if (!info.isFile()) skipped.push({ path: key, why: "not a regular file (a link?)" });
      else if (IN_PROGRESS.test(name)) skipped.push({ path: key, why: "a write in progress" });
      else if (storageKeyProblem(key) || !isSafeTarPath(`storage/${key}`))
        skipped.push({ path: key, why: "a name storage doesn't use" });
      else keys.push(key);
    }
  };
  await walk(root, "");
  return keys;
};

const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The same chunks, each added to `hash` as it passes. */
const hashing = (
  chunks: AsyncIterable<Uint8Array>,
  hash: ReturnType<typeof createHash>,
): AsyncIterable<Uint8Array> => ({
  [Symbol.asyncIterator]: () => {
    const source = chunks[Symbol.asyncIterator]();
    return {
      next: async () => {
        const result = await source.next();
        if (!result.done) hash.update(result.value);
        return result;
      },
      // An early stop (the tar failed) closes the source, which stops reading the file.
      return: async (value?: unknown) =>
        source.return
          ? source.return(value)
          : ({ done: true, value } as IteratorReturnResult<unknown>),
    };
  },
});

/**
 * Writes the whole archive into `options.write`: the database inside one snapshot (taken once no
 * migration is running), then storage, which is read after the snapshot so it holds every artifact
 * the snapshot names (artifacts are stored before their row is committed, and never change), then
 * the settings and the manifest. Throws on the first failure; the bytes written so far are then an
 * incomplete archive, which the caller removes.
 */
export const writeBackupArchive = async (
  options: BackupArchiveOptions,
): Promise<BackupArchiveResult> => {
  const { db, dialect } = options;
  const now = options.now ?? (() => new Date());
  const tar = createTarWriter(options.write);
  const files: Record<string, FileDigest> = {};
  const addFile = async (path: string, bytes: Uint8Array) => {
    await tar.addFile(path, bytes);
    files[path] = { size: bytes.length, sha256: sha256(bytes) };
  };

  // Released versions' artifacts, by storage key: checked against storage once it's copied.
  const artifacts = new Map<string, { item: string; version: string; sha256: string }>();
  const { info, tables } = await readSnapshot(
    db,
    dialect,
    async (snapshot) => {
      const createdAt = now().toISOString();
      const { rows: applied } = await sql<{ name: string }>`
        select name from ${sql.table(MIGRATION_TABLE)} order by name`.execute(snapshot);
      const info: BackupInfo = {
        format: BACKUP_FORMAT,
        ronne: options.version,
        createdAt,
        dialect,
        // Byte order, whatever the database's collation.
        migrations: applied.map((r) => r.name).sort(byBytes),
      };
      await tar.addFile("backup.json", json(info));
      const schema = await readSchema(snapshot, dialect);
      const tables = await dumpTables(snapshot, dialect, schema, addFile, options.dump);
      const { rows: versions } = await sql<{
        artifact_path: string;
        sha256: string;
        version: string;
        scope: string;
        name: string;
      }>`
        select v.artifact_path, v.sha256, v.version, s.name as scope, i.name
        from item_versions v
        join items i on i.id = v.item_id
        join scopes s on s.id = i.scope_id`.execute(snapshot);
      for (const v of versions)
        artifacts.set(v.artifact_path, {
          item: `@${v.scope}/${v.name}`,
          version: v.version,
          sha256: v.sha256,
        });
      return { info, tables };
    },
    { waitForMigrations: true },
  );

  const skipped: BackupArchiveResult["skipped"] = [];
  const stored = new Map<string, string>();
  let storageBytes = 0;
  for (const key of await storageFiles(options.storageRoot, skipped)) {
    const path = `storage/${key}`;
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(join(options.storageRoot, ...key.split("/")), "r");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    try {
      // The size of the file this handle reads, even if another replaces it meanwhile.
      const { size } = await handle.stat();
      const hash = createHash("sha256");
      await tar.addStream(
        path,
        size,
        hashing(handle.createReadStream({ autoClose: false, highWaterMark: 64 * 1024 }), hash),
      );
      const digest = hash.digest("hex");
      files[path] = { size, sha256: digest };
      stored.set(key, digest);
      storageBytes += size;
    } finally {
      await handle.close();
    }
  }

  const missingArtifacts: MissingArtifact[] = [];
  const alteredArtifacts: MissingArtifact[] = [];
  for (const [path, artifact] of [...artifacts].sort(([a], [b]) => byBytes(a, b))) {
    const digest = stored.get(path);
    const entry = { item: artifact.item, version: artifact.version, path };
    if (digest === undefined) missingArtifacts.push(entry);
    else if (digest !== artifact.sha256) alteredArtifacts.push(entry);
  }

  if (options.settings) await addFile("settings.env", options.settings);

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    tables,
    files,
    storage: { files: stored.size, bytes: storageBytes },
    settings: { included: options.settings !== null, environmentOnly: options.environmentOnly },
    missingArtifacts,
  };
  await tar.addFile("manifest.json", json(manifest));
  await tar.end();
  return { info, manifest, alteredArtifacts, skipped };
};
