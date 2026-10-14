import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTarReader, type TarEntrySink } from "@ronneai/core/pack";
import { type Kysely, sql } from "kysely";
import { parseExactTimestamp } from "../db/dates";
import { foreignKeyOrder, readSchema, type TableColumn, type TableSchema } from "../db/introspect";
import { MIGRATION_TABLE, migrateToExactly } from "../db/migrate";
import type { DatabaseDialect } from "../db/url";
import { createOpener } from "./crypto";
import type { VerifyResult } from "./verify";

/**
 * The writing half of `rmk-server restore` (099): an empty database migrated to exactly the
 * backup's migrations, the rows loaded table by table in one transaction, each value converted to
 * the target column's type as `docs/spec/backup-format.md` says, then the storage files written
 * and checked. The archive was verified whole first (`verify.ts`); this reads it a second time and
 * checks every entry again, so an archive changed in between stops it.
 */

/** The restore stopped. `wrote` says whether the target was changed before it did. */
export class RestoreError extends Error {
  constructor(
    message: string,
    readonly wrote: boolean,
  ) {
    super(message);
    this.name = "RestoreError";
  }
}

/** A database is empty when it has no tables, or only the migration tables with nothing applied. */
export const isEmptyDatabase = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  if ((await readSchema(db, dialect)).length > 0) return false;
  try {
    const { rows } = await sql<{ n: number | string }>`
      select count(*) as n from ${sql.table(MIGRATION_TABLE)}`.execute(db);
    return Number(rows[0]?.n ?? 0) === 0;
  } catch {
    // No migration table: nothing was ever migrated here.
    return true;
  }
};

type Kind = "boolean" | "integer" | "timestamp" | "bytes" | "text";

/**
 * What a target column holds, from its type as the database reports it (`introspect.ts`). In
 * SQLite a boolean is an `integer` and a timestamp is `text` (`column-types.ts`).
 */
const kindOf = (column: TableColumn, dialect: DatabaseDialect): Kind => {
  const type = column.type;
  if (/bytea|blob/.test(type)) return "bytes";
  if (dialect === "postgres") {
    if (type === "boolean") return "boolean";
    if (type.startsWith("timestamp")) return "timestamp";
    if (/^(smallint|integer|bigint)$/.test(type)) return "integer";
    return "text";
  }
  if (dialect === "mysql") {
    if (type === "tinyint(1)") return "boolean";
    if (type.startsWith("datetime") || type.startsWith("timestamp")) return "timestamp";
    if (/^(tinyint|smallint|mediumint|int|bigint)\b/.test(type)) return "integer";
    return "text";
  }
  if (type === "integer") return "integer";
  // SQLite's timestamps are text: by the schema's naming (every timestamp column ends in `_at`,
  // and nothing else does; a test checks it where the types show), so they're checked too.
  return column.name.endsWith("_at") ? "timestamp" : "text";
};

/**
 * One value as the target column takes it (the format spec's "A reader, for each target column"),
 * or a RestoreError naming where it is.
 */
export const convertValue = (
  value: unknown,
  column: TableColumn,
  dialect: DatabaseDialect,
  where: string,
): unknown => {
  const refuse = (what: string) =>
    new RestoreError(`${where}, column ${column.name}: ${what}.`, true);
  if (value === null) {
    if (!column.nullable) throw refuse("null, which the column doesn't allow");
    return null;
  }
  const kind = kindOf(column, dialect);
  if (kind === "boolean") {
    if (value === true || value === 1) return dialect === "postgres" ? true : 1;
    if (value === false || value === 0) return dialect === "postgres" ? false : 0;
    throw refuse("not a boolean");
  }
  if (kind === "integer") {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number" && Number.isSafeInteger(value)) return value;
    throw refuse("not a whole number");
  }
  if (kind === "timestamp") {
    // Read back exactly, so an impossible date (February 30, 24:00) isn't moved to another one.
    const text = typeof value === "string" ? value : "";
    const date = parseExactTimestamp(text);
    if (!date) throw refuse("not an ISO 8601 UTC timestamp");
    // As text, never a Date: drivers write Dates in the process's time zone, and node-pg cuts the
    // seconds of old local-mean-time offsets (1850 in New York moved two seconds back). PostgreSQL
    // reads the ISO form with its Z; MySQL's session is UTC (create-db.ts), so the plain form is.
    if (dialect === "sqlite") return text;
    const iso = date.toISOString();
    return dialect === "postgres" ? iso : iso.replace("T", " ").replace("Z", "");
  }
  if (kind === "bytes") {
    if (
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      typeof (value as { $b64?: unknown }).$b64 === "string"
    )
      return Buffer.from((value as { $b64: string }).$b64, "base64");
    throw refuse('not {"$b64": …}');
  }
  if (typeof value === "string") return value;
  throw refuse("not text");
};

/** Rows inserted per statement, at most, and about this many bytes of them. */
const BATCH_ROWS = 500;
const BATCH_BYTES = 4 * 1024 * 1024;
/** Bound parameters per statement, under every driver's limit (SQLite's is 32,766). */
const BATCH_PARAMS = 10_000;

export type RestoredCounts = { rows: number; files: number; bytes: number };

/**
 * Restores a verified archive into `db`, a single connection to an empty database that holds the
 * migration lock. `source` opens the archive again for the second read. Returns what it wrote and
 * the settings file's bytes when the archive has one. The newer migrations are the caller's.
 */
export const restoreArchive = async (options: {
  db: Kysely<unknown>;
  dialect: DatabaseDialect;
  verified: VerifyResult;
  source: () => AsyncIterable<Uint8Array>;
  passphrase?: Buffer;
  storageRoot: string;
}): Promise<RestoredCounts & { settings: Buffer | null }> => {
  const { db, dialect, verified } = options;
  const { manifest } = verified;
  let wrote = false;
  const fail = (message: string) => new RestoreError(message, wrote);

  // 1. Exactly the backup's migrations, then the tables they made, as the manifest names them.
  wrote = true;
  await migrateToExactly(db, dialect, verified.info.migrations);
  const schema = await readSchema(db, dialect);
  const byName = new Map(schema.map((t) => [t.name, t]));
  const names = (list: Iterable<string>) => [...list].sort().join(", ");
  if (names(byName.keys()) !== names(Object.keys(manifest.tables)))
    throw fail(
      "The archive's tables aren't the ones its migrations make here: it doesn't belong to them.",
    );
  for (const [name, listed] of Object.entries(manifest.tables)) {
    const table = byName.get(name) as TableSchema;
    if (
      names(table.columns.map((c) => c.name)) !== names(listed.columns) ||
      table.primaryKey.join(",") !== listed.primaryKey.join(",")
    )
      throw fail(`The archive's columns of ${name} aren't the ones its migrations make here.`);
  }
  // Each table after the tables it refers to, in the archive's order.
  const loaded = new Set<string>();
  for (const name of verified.tableOrder) {
    const table = byName.get(name) as TableSchema;
    const early = table.references.find(
      (r) => !loaded.has(r) && (manifest.tables[r]?.rows ?? 0) > 0,
    );
    if (early)
      throw fail(`The archive holds ${name}'s rows before those of ${early}, which they refer to.`);
    loaded.add(name);
  }

  // 2. One transaction for the rows: the migrations' own rows (the global workspace…) go, then
  // the backup's come in, in foreign-key order.
  const begin = dialect === "mysql" ? sql`start transaction` : sql`begin`;
  await begin.execute(db);
  let open_ = true;
  // What the second read saw: every entry the manifest lists must come again, each table's rows
  // all of them (an archive that lost an entry between the reads would restore without it).
  const seen = new Set<string>();
  const totalRows = Object.values(manifest.tables).reduce((sum, t) => sum + t.rows, 0);
  const missing = (prefix: string) =>
    Object.keys(manifest.files).find((path) => path.startsWith(prefix) && !seen.has(path));
  const commit = async () => {
    if (!open_) return;
    const part = missing("database/");
    if (part || counts.rows !== totalRows)
      throw fail(
        `${part ?? "A table's rows"} went missing from the archive since it was verified: run the restore again.`,
      );
    open_ = false;
    await sql`commit`.execute(db);
  };
  const rollback = async () => {
    if (!open_) return;
    open_ = false;
    await sql`rollback`.execute(db).catch(() => undefined);
  };

  const counts: RestoredCounts = { rows: 0, files: 0, bytes: 0 };
  let settings: Buffer | null = null;
  try {
    for (const table of [...foreignKeyOrder(schema)].reverse())
      await sql`delete from ${sql.table(table.name)}`.execute(db);

    const any = db as Kysely<Record<string, Record<string, unknown>>>;
    /** Checks an entry's bytes against the verified manifest as they pass. */
    const checked = (path: string) => {
      const hash = createHash("sha256");
      let size = 0;
      return {
        update: (chunk: Uint8Array) => {
          hash.update(chunk);
          size += chunk.length;
        },
        done: () => {
          seen.add(path);
          const listed = manifest.files[path];
          if (!listed || listed.size !== size || listed.sha256 !== hash.digest("hex"))
            throw fail(`${path} changed since the archive was verified: run the restore again.`);
        },
      };
    };

    const partSink = (path: string, name: string): TarEntrySink => {
      const table = byName.get(name) as TableSchema;
      const columns = table.columns;
      const check = checked(path);
      let line: Uint8Array[] = [];
      let lineSize = 0;
      let lineNumber = 0;
      let batch: Record<string, unknown>[] = [];
      let batchBytes = 0;
      const perBatch = Math.max(1, Math.min(BATCH_ROWS, Math.floor(BATCH_PARAMS / columns.length)));
      const flush = async () => {
        if (batch.length === 0) return;
        const rows = batch;
        batch = [];
        batchBytes = 0;
        await any.insertInto(name).values(rows).execute();
      };
      const takeLine = async () => {
        const bytes = Buffer.concat(line, lineSize);
        line = [];
        lineSize = 0;
        lineNumber++;
        const where = `${path}, line ${lineNumber}`;
        const row = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const column of columns)
          out[column.name] = convertValue(row[column.name], column, dialect, where);
        if (batch.length > 0 && batchBytes + bytes.length > BATCH_BYTES) await flush();
        batch.push(out);
        batchBytes += bytes.length;
        counts.rows++;
        if (batch.length >= perBatch || batchBytes >= BATCH_BYTES) await flush();
      };
      return {
        data: async (chunk) => {
          check.update(chunk);
          let start = 0;
          for (let nl = chunk.indexOf(0x0a); nl !== -1; nl = chunk.indexOf(0x0a, start)) {
            line.push(chunk.subarray(start, nl));
            lineSize += nl - start;
            await takeLine();
            start = nl + 1;
          }
          if (start < chunk.length) {
            line.push(chunk.slice(start));
            lineSize += chunk.length - start;
          }
        },
        end: async () => {
          check.done();
          await flush();
        },
      };
    };

    const storageSink = async (path: string): Promise<TarEntrySink> => {
      // Past the database: its rows are in, and stay in whatever happens to the files.
      await commit();
      const key = path.slice("storage/".length);
      const target = join(options.storageRoot, ...key.split("/"));
      await mkdir(dirname(target), { recursive: true });
      // Never over a file that's there: the storage was empty, and stays only what's restored.
      const handle = await open(target, "wx", 0o600);
      const check = checked(path);
      let failed = false;
      return {
        data: async (chunk) => {
          check.update(chunk);
          try {
            await handle.write(chunk);
          } catch (error) {
            failed = true;
            await handle.close().catch(() => undefined);
            throw error;
          }
        },
        end: async () => {
          if (!failed) await handle.close();
          check.done();
          counts.files++;
          counts.bytes += manifest.files[path]?.size ?? 0;
        },
      };
    };

    // The format's order, as the first read checked it: anything else is a changed archive.
    const order = ["backup.json", "database", "storage", "settings.env", "manifest.json"];
    let phase = -1;
    let partsRead = 0;
    const changed = (path: string) =>
      fail(`${path} changed since the archive was verified: run the restore again.`);
    const reader = createTarReader(async (path, _size): Promise<TarEntrySink> => {
      const part = /^database\/([^/]+)\/\d{6}\.jsonl$/.exec(path);
      const at = order.indexOf(part ? "database" : path.startsWith("storage/") ? "storage" : path);
      // backup.json first and once, manifest.json last, the rest in the format's order.
      if (at === -1 || at < phase || (phase === -1 && at !== 0) || (at === 0 && phase === 0))
        throw changed(path);
      phase = at;
      if (part) {
        // Exactly the parts the first read saw, in its order: interleaved, renumbered or moved
        // parts, or a table the schema doesn't have, are a changed archive.
        if (verified.partOrder[partsRead++] !== path || !byName.has(part[1] as string))
          throw changed(path);
        return partSink(path, part[1] as string);
      }
      if (path.startsWith("storage/")) return storageSink(path);
      if (path === "settings.env") {
        await commit();
        const check = checked(path);
        const parts: Uint8Array[] = [];
        return {
          data: (chunk) => {
            check.update(chunk);
            parts.push(chunk.slice());
          },
          end: () => {
            check.done();
            settings = Buffer.concat(parts);
          },
        };
      }
      // backup.json and manifest.json: read again only to see they're the same bytes.
      if (path !== "backup.json" && path !== "manifest.json")
        throw fail(`${path} changed since the archive was verified: run the restore again.`);
      if (path === "manifest.json") await commit();
      const hash = createHash("sha256");
      return {
        data: (chunk) => {
          hash.update(chunk);
        },
        end: () => {
          seen.add(path);
          const expected = path === "backup.json" ? verified.infoSha256 : verified.manifestSha256;
          if (hash.digest("hex") !== expected)
            throw fail(`${path} changed since the archive was verified: run the restore again.`);
        },
      };
    });

    const opener = options.passphrase
      ? createOpener(options.passphrase, (plain) => reader.push(plain))
      : null;
    for await (const chunk of options.source())
      await (opener ? opener.push(chunk) : reader.push(chunk));
    if (opener) await opener.end();
    await reader.end();
    await commit();
    const lost = missing("") ?? ["backup.json", "manifest.json"].find((path) => !seen.has(path));
    if (lost || counts.files !== manifest.storage.files)
      throw fail(
        `${lost ?? "A stored file"} went missing from the archive since it was verified: run the restore again.`,
      );
  } catch (error) {
    await rollback();
    if (error instanceof RestoreError) throw new RestoreError(error.message, wrote);
    const message = error instanceof Error ? error.message : String(error);
    throw fail(`The restore stopped: ${message.replace(/\.$/, "")}.`);
  }
  return { ...counts, settings };
};
