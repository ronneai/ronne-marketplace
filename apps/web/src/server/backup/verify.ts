import { createHash } from "node:crypto";
import { createTarReader, type TarEntrySink } from "@ronneai/core/pack";
import { storageKeyProblem } from "../storage/storage-adapter";
import { BACKUP_FORMAT, type BackupInfo, type BackupManifest, type FileDigest } from "./archive";
import { ContainerError, createOpener, HEADER_BYTES, isContainer, parseHeader } from "./crypto";

/**
 * `backup --verify` (099): reads a whole archive (decrypting it when it's the encrypted container)
 * and runs the checks `docs/spec/backup-format.md` gives a reader, in "What a reader checks",
 * without a database or anything written. Streams: memory follows the number of entries and
 * tables, never the archive's size. Restore (task 6) runs the same checks before it writes.
 */

/** The archive doesn't pass: the message names the first problem. */
export class VerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyError";
  }
}

export type VerifyResult = {
  info: BackupInfo;
  manifest: BackupManifest;
  encrypted: boolean;
  /** The archive's size on disk. */
  bytes: number;
  /** The tables with rows, in the order the archive holds them (restore loads them in it). */
  tableOrder: string[];
  /** Every database part's path, in the archive's order: the second read must see the same. */
  partOrder: string[];
  /** backup.json's and manifest.json's sha256, which the manifest can't list: restore reads them again. */
  infoSha256: string;
  manifestSha256: string;
  /** settings.env's bytes, when asked for (`keepSettings`) and the archive has one. */
  settings: Buffer | null;
};

/** The largest backup.json, and the largest manifest.json, a reader takes. */
const INFO_MAX = 1024 * 1024;
const MANIFEST_MAX = 256 * 1024 * 1024;
/** The longest line of a part a reader holds (the format's rows are far smaller). */
const LINE_MAX = 256 * 1024 * 1024;

const PART = /^database\/([^/]+)\/(\d{6})\.jsonl$/;

const problem = (message: string) => new VerifyError(message);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

const sha256Of = () => createHash("sha256");

const utf8 = new TextDecoder("utf-8", { fatal: true });
const decodeText = (bytes: Uint8Array, what: string) => {
  try {
    return utf8.decode(bytes);
  } catch {
    throw problem(`${what} isn't UTF-8 text.`);
  }
};

const parseJson = (bytes: Uint8Array, what: string): unknown => {
  try {
    return JSON.parse(decodeText(bytes, what));
  } catch (error) {
    if (error instanceof VerifyError) throw error;
    throw problem(`${what} isn't valid JSON.`);
  }
};

/** Collects an entry's bytes, up to `max`. */
const collect = (max: number, what: string) => {
  const parts: Uint8Array[] = [];
  let size = 0;
  return {
    data: (chunk: Uint8Array) => {
      size += chunk.length;
      if (size > max) throw problem(`${what} is larger than a backup's ever is.`);
      parts.push(chunk.slice());
    },
    bytes: () => Buffer.concat(parts, size),
  };
};

/** `backup.json` checked: format 1, and migrations this app has, in its order. */
const checkInfo = (value: unknown, knownMigrations: readonly string[]): BackupInfo => {
  if (!isRecord(value)) throw problem("backup.json isn't an object.");
  const { format, ronne, createdAt, dialect, migrations } = value;
  const version = typeof ronne === "string" ? ronne : "an unknown version";
  if (format !== BACKUP_FORMAT)
    throw problem(
      typeof format === "number" && Number.isInteger(format) && format > BACKUP_FORMAT
        ? `This backup was made by Ronne ${version} in backup format ${format}; install that version or newer to read it.`
        : "backup.json names no backup format this Ronne knows.",
    );
  if (
    typeof ronne !== "string" ||
    typeof createdAt !== "string" ||
    (dialect !== "sqlite" && dialect !== "postgres" && dialect !== "mysql") ||
    !isStringArray(migrations)
  )
    throw problem("backup.json is missing fields the format requires.");
  const unknown = migrations.filter((m) => !knownMigrations.includes(m));
  if (unknown.length > 0)
    throw problem(
      `This backup comes from a newer Ronne (${version}); install that version or newer to restore it.`,
    );
  if (migrations.some((m, i) => knownMigrations[i] !== m))
    throw problem(
      "backup.json's migrations aren't in the order this Ronne applies them: the archive is damaged.",
    );
  return { format, ronne, createdAt, dialect, migrations };
};

/** `manifest.json`'s shape, before its numbers are compared with what was counted. */
const checkManifestShape = (value: unknown): BackupManifest => {
  const bad = () =>
    problem("manifest.json is missing fields the format requires, or has wrong ones.");
  if (!isRecord(value)) throw bad();
  const { format, tables, files, storage, settings, missingArtifacts } = value;
  if (format !== BACKUP_FORMAT) throw problem("manifest.json's format isn't backup.json's.");
  if (!isRecord(tables) || !isRecord(files) || !isRecord(storage) || !isRecord(settings))
    throw bad();
  for (const table of Object.values(tables)) {
    if (
      !isRecord(table) ||
      !isStringArray(table.columns) ||
      !isStringArray(table.primaryKey) ||
      !Number.isSafeInteger(table.rows) ||
      !Number.isSafeInteger(table.parts)
    )
      throw bad();
  }
  for (const file of Object.values(files))
    if (!isRecord(file) || !Number.isSafeInteger(file.size) || typeof file.sha256 !== "string")
      throw bad();
  if (
    !Number.isSafeInteger(storage.files) ||
    !Number.isSafeInteger(storage.bytes) ||
    typeof settings.included !== "boolean" ||
    !isStringArray(settings.environmentOnly) ||
    !Array.isArray(missingArtifacts) ||
    !missingArtifacts.every(
      (m) =>
        isRecord(m) &&
        typeof m.item === "string" &&
        typeof m.version === "string" &&
        typeof m.path === "string",
    )
  )
    throw bad();
  return value as BackupManifest;
};

/**
 * The database parts of one table as they're read: rows counted, each line's keys remembered as a
 * signature (a table's rows almost always share one), and the released versions' artifacts when
 * the table is `item_versions`.
 */
type TableSeen = { parts: number; rows: number; keySets: Set<string> };

/**
 * Verifies the archive whose bytes `source` gives, in order. `passphrase` is asked only when the
 * archive is encrypted. `knownMigrations` is this app's migration list. Throws a VerifyError (or a
 * ContainerError for an encrypted archive that can't be opened) with the first problem.
 */
export const verifyArchive = async (options: {
  source: AsyncIterable<Uint8Array>;
  passphrase: () => Promise<Buffer>;
  knownMigrations: readonly string[];
  /** Keep settings.env's bytes (restore reads the backup's settings before it writes). */
  keepSettings?: boolean;
}): Promise<VerifyResult> => {
  // Where in the format's order the archive is: what may come next.
  let phase: "start" | "database" | "storage" | "settings" | "manifest" = "start";
  const order = ["start", "database", "storage", "settings", "manifest"] as const;
  const advance = (to: (typeof order)[number], path: string) => {
    if (order.indexOf(to) < order.indexOf(phase))
      throw problem(
        `${path} is out of the format's order (backup.json, database, storage, settings, manifest).`,
      );
    phase = to;
  };
  let info: BackupInfo | null = null;
  let infoSha256 = "";
  let manifestSha256 = "";
  let manifest: BackupManifest | null = null;
  let entries = 0;
  const digests = new Map<string, FileDigest>();
  const tables = new Map<string, TableSeen>();
  const partOrder: string[] = [];
  let currentTable: string | null = null;
  const storage = new Map<string, string>();
  let storageBytes = 0;
  let settingsSeen = false;
  let settingsBytes: Buffer | null = null;
  const artifacts = new Map<string, string>();

  /** A database part: lines read as they come, each one JSON object. */
  const partSink = (path: string, table: string, size: number): TarEntrySink => {
    const seen = tables.get(table) as TableSeen;
    const hash = sha256Of();
    let line: Uint8Array[] = [];
    let lineSize = 0;
    let rows = 0;
    let lastByte = -1;
    const takeLine = () => {
      const bytes = Buffer.concat(line, lineSize);
      line = [];
      lineSize = 0;
      if (bytes.length === 0) throw problem(`${path} has a blank line.`);
      const row = parseJson(bytes, `A line of ${path}`);
      if (!isRecord(row)) throw problem(`A line of ${path} isn't a JSON object.`);
      // As JSON, so no key can pass for two (a key may hold any character, NUL included).
      seen.keySets.add(JSON.stringify(Object.keys(row).sort()));
      if (table === "item_versions") {
        const { artifact_path: artifactPath, sha256 } = row;
        if (typeof artifactPath !== "string" || typeof sha256 !== "string")
          throw problem(`A row of item_versions in ${path} has no artifact path or sha256.`);
        artifacts.set(artifactPath, sha256);
      }
      rows++;
    };
    return {
      data: (chunk) => {
        hash.update(chunk);
        if (chunk.length > 0) lastByte = chunk[chunk.length - 1] as number;
        let start = 0;
        for (let nl = chunk.indexOf(0x0a); nl !== -1; nl = chunk.indexOf(0x0a, start)) {
          line.push(chunk.subarray(start, nl));
          lineSize += nl - start;
          takeLine();
          start = nl + 1;
        }
        if (start < chunk.length) {
          lineSize += chunk.length - start;
          if (lineSize > LINE_MAX) throw problem(`A line of ${path} is longer than any row.`);
          line.push(chunk.slice(start));
        }
      },
      end: () => {
        if (lineSize > 0 || lastByte !== 0x0a)
          throw problem(`${path} doesn't end with a line break.`);
        if (rows === 0) throw problem(`${path} holds no rows.`);
        seen.rows += rows;
        digests.set(path, { size, sha256: hash.digest("hex") });
      },
    };
  };

  /** Any other entry: hashed as it passes. */
  const hashSink = (path: string, size: number, then?: (sha256: string) => void): TarEntrySink => {
    const hash = sha256Of();
    return {
      data: (chunk) => {
        hash.update(chunk);
      },
      end: () => {
        const sha256 = hash.digest("hex");
        digests.set(path, { size, sha256 });
        then?.(sha256);
      },
    };
  };

  const reader = createTarReader((path, size): TarEntrySink => {
    if (manifest || phase === "manifest")
      throw problem(`${path} comes after manifest.json, which must be last.`);
    entries++;
    if (entries === 1 && path !== "backup.json")
      throw problem(
        "The archive doesn't start with backup.json: it isn't a Ronne backup, or it's damaged.",
      );
    if (path === "backup.json") {
      if (entries !== 1) throw problem("backup.json isn't the archive's first entry.");
      const bytes = collect(INFO_MAX, "backup.json");
      return {
        data: bytes.data,
        end: () => {
          infoSha256 = createHash("sha256").update(bytes.bytes()).digest("hex");
          info = checkInfo(parseJson(bytes.bytes(), "backup.json"), options.knownMigrations);
        },
      };
    }
    const part = PART.exec(path);
    if (part) {
      advance("database", path);
      const [, table, number] = part as unknown as [string, string, string];
      let seen = tables.get(table);
      if (table !== currentTable) {
        if (seen) throw problem(`${path}: the parts of ${table} aren't together.`);
        seen = { parts: 0, rows: 0, keySets: new Set() };
        tables.set(table, seen);
        currentTable = table;
      }
      if (Number(number) !== (seen as TableSeen).parts + 1)
        throw problem(`${path} is out of order: parts are numbered from 000001 with no gaps.`);
      (seen as TableSeen).parts++;
      partOrder.push(path);
      return partSink(path, table, size);
    }
    if (path.startsWith("storage/")) {
      advance("storage", path);
      const key = path.slice("storage/".length);
      if (storageKeyProblem(key)) throw problem(`${path} isn't a storage key Ronne writes.`);
      storageBytes += size;
      return hashSink(path, size, (sha256) => storage.set(key, sha256));
    }
    if (path === "settings.env") {
      advance("settings", path);
      settingsSeen = true;
      if (!options.keepSettings) return hashSink(path, size);
      const kept = collect(INFO_MAX, "settings.env");
      const hashed = hashSink(path, size);
      return {
        data: async (chunk) => {
          kept.data(chunk);
          await hashed.data(chunk);
        },
        end: async () => {
          settingsBytes = kept.bytes();
          await hashed.end();
        },
      };
    }
    if (path === "manifest.json") {
      advance("manifest", path);
      const bytes = collect(MANIFEST_MAX, "manifest.json");
      return {
        data: bytes.data,
        end: () => {
          manifestSha256 = createHash("sha256").update(bytes.bytes()).digest("hex");
          manifest = checkManifestShape(parseJson(bytes.bytes(), "manifest.json"));
        },
      };
    }
    throw problem(`${path} isn't an entry a Ronne backup holds.`);
  });

  // The first bytes say whether it's encrypted: the container's magic, never the name.
  let bytes = 0;
  let encrypted = false;
  let target: { push: (chunk: Uint8Array) => Promise<void>; end: () => Promise<void> } | null =
    null;
  let start: Uint8Array[] = [];
  let startSize = 0;
  const route = async () => {
    const head = Buffer.concat(start, startSize);
    encrypted = isContainer(head);
    if (encrypted) {
      // The header first: a newer or damaged one is said before any passphrase is asked for.
      parseHeader(head);
      const opener = createOpener(await options.passphrase(), (plain) => reader.push(plain));
      target = {
        push: opener.push,
        end: async () => {
          await opener.end();
          await reader.end();
        },
      };
    } else target = { push: reader.push, end: reader.end };
    start = [];
    startSize = 0;
    await target.push(head);
  };
  try {
    for await (const chunk of options.source) {
      bytes += chunk.length;
      if (target) await (target as { push: (c: Uint8Array) => Promise<void> }).push(chunk);
      else {
        start.push(chunk.slice());
        startSize += chunk.length;
        // Enough to tell plain from encrypted, and for an encrypted one its whole header.
        if (startSize >= HEADER_BYTES) await route();
      }
    }
    if (!target) await route();
    await (target as unknown as { end: () => Promise<void> }).end();
  } catch (error) {
    if (error instanceof VerifyError || error instanceof ContainerError) throw error;
    if ((error as Error)?.name === "TarError")
      throw problem(`The archive isn't a valid backup: ${(error as Error).message}`);
    throw error;
  }

  // What was counted, against what the manifest says.
  const done = { info, manifest } as { info: BackupInfo | null; manifest: BackupManifest | null };
  if (!done.info) throw problem("The archive has no backup.json.");
  if (!done.manifest) throw problem("The archive has no manifest.json: it was cut short.");
  const m = done.manifest;
  for (const [path, digest] of digests) {
    const listed = m.files[path];
    if (!listed) throw problem(`${path} is in the archive but not in its manifest.`);
    if (listed.size !== digest.size || listed.sha256 !== digest.sha256)
      throw problem(
        `${path} doesn't match its checksum in the manifest: the archive is damaged or was altered.`,
      );
  }
  for (const path of Object.keys(m.files))
    if (!digests.has(path)) throw problem(`${path} is in the manifest but not in the archive.`);
  for (const table of tables.keys())
    if (!m.tables[table])
      throw problem(`The archive has rows of ${table}, which its manifest doesn't list.`);
  for (const [table, listed] of Object.entries(m.tables)) {
    const seen = tables.get(table) ?? { parts: 0, rows: 0, keySets: new Set<string>() };
    if (listed.parts !== seen.parts || listed.rows !== seen.rows)
      throw problem(
        `${table} has ${seen.rows} rows in ${seen.parts} parts, but its manifest says ${listed.rows} in ${listed.parts}.`,
      );
    const columns = JSON.stringify([...listed.columns].sort());
    if (new Set(listed.columns).size !== listed.columns.length || listed.columns.length === 0)
      throw problem(`The manifest's columns of ${table} are empty or repeated.`);
    if (
      !listed.primaryKey.every((c) => listed.columns.includes(c)) ||
      listed.primaryKey.length === 0
    )
      throw problem(`The manifest's primary key of ${table} isn't among its columns.`);
    for (const keys of seen.keySets)
      if (keys !== columns)
        throw problem(`A row of ${table} doesn't have exactly the columns its manifest lists.`);
  }
  if (m.storage.files !== storage.size || m.storage.bytes !== storageBytes)
    throw problem("The manifest's count of stored files doesn't match the archive's.");
  if (m.settings.included !== settingsSeen)
    throw problem(
      "The manifest says the settings file is in the archive when it isn't, or the other way round.",
    );
  const missing = new Set(m.missingArtifacts.map((a) => a.path));
  for (const [path, sha256] of artifacts) {
    const stored = storage.get(path);
    if (stored === undefined && !missing.has(path))
      throw problem(
        `A released version's artifact, ${path}, is missing from the archive and from its list of missing artifacts.`,
      );
    if (stored !== undefined && stored !== sha256)
      throw problem(
        `A released version's artifact, ${path}, has another sha256 than its database row records.`,
      );
  }
  return {
    info: done.info,
    manifest: m,
    encrypted,
    bytes,
    tableOrder: [...tables.keys()],
    partOrder,
    infoSha256,
    manifestSha256,
    settings: settingsBytes,
  };
};
