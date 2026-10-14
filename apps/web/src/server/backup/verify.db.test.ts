import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createTarWriter, readTar } from "@ronneai/core/pack";
import { afterEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/create-db";
import { toDbDate } from "../db/dates";
import { migrateToLatest } from "../db/migrate";
import { migrations } from "../db/migrations";
import { GLOBAL_WORKSPACE_ID } from "../db/migrations/0019_workspaces";
import { createTestDb } from "../db/testing/test-db";
import type { DatabaseDialect } from "../db/url";
import { createRoot } from "../domains/identity/actions/root-account";
import { kyselyItemRepository } from "../domains/items/repositories/kysely-item-repository";
import { UNFILTERED } from "../domains/workspaces/models/viewer";
import type { BackupManifest } from "./archive";
import { passphraseBytes } from "./crypto";
import { type BackupLog, runBackup } from "./run-backup";
import { runVerify, VerifyFailedError } from "./run-verify";
import { verifyArchive } from "./verify";

// Runs on the database in TEST_DATABASE_URL (SQLite by default); the archives it checks are made
// by the real backup, then altered one rule at a time.
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const NOW = new Date("2026-10-12T15:31:02.123Z");
const KNOWN = Object.keys(migrations);
const ARTIFACT = new TextEncoder().encode("the 1.0.0 artifact");
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

type Instance = { db: Db; dialect: DatabaseDialect; url: string; dir: string };

/** An instance with root, an item with 1.0.0 (stored) and 1.1.0 (not stored). */
const instance = async (): Promise<Instance> => {
  const dir = mkdtempSync(join(tmpdir(), "ronne-verify-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  let t = await createTestDb();
  cleanups.push(t.cleanup);
  if (t.url === "file::memory:") {
    const url = `file:${join(dir, "ronne.db")}`;
    const { db } = createDb(url);
    await migrateToLatest(db, "sqlite");
    cleanups.push(() => db.destroy());
    t = { ...t, db, url };
  }
  writeFileSync(
    join(dir, ".env"),
    `DATABASE_URL=${t.url}\nAUTH_SECRET=${"s".repeat(43)}\nSTORAGE_PATH=${join(dir, "storage")}\n`,
  );
  const { id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  await t.db
    .insertInto("scopes")
    .values({
      id: "scope-1",
      name: "incident",
      description: "Items for the verify test.",
      created_by: rootId,
      created_at: toDbDate(NOW, t.dialect),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
  await kyselyItemRepository(t.db, t.dialect, UNFILTERED).transaction(async (repo) => {
    const itemId = await repo.insertItem({
      scopeId: "scope-1",
      name: "notes",
      type: "skill",
      description: "Notes.",
      ownerId: rootId,
      createdAt: NOW,
    });
    for (const version of ["1.0.0", "1.1.0"])
      await repo.insertVersion({
        itemId,
        version,
        manifest: { name: "@incident/notes", type: "skill", description: "Notes.", version },
        readme: null,
        files: [{ path: "SKILL.md", size: 10, executable: false }],
        notes: null,
        artifactPath: `incident/notes/${version}.tgz`,
        sha256: sha256(version === "1.0.0" ? ARTIFACT : "never stored"),
        size: 1024,
        publishedBy: rootId,
        publishedAt: NOW,
        submissionId: null,
        dependencies: [],
        riskFlags: [],
      });
  });
  mkdirSync(join(dir, "storage", "incident", "notes"), { recursive: true });
  writeFileSync(join(dir, "storage", "incident", "notes", "1.0.0.tgz"), ARTIFACT);
  return { ...t, dir };
};

const quiet: BackupLog = { info: () => undefined, warn: () => undefined };

/** A real backup's bytes; each in a folder of its own, so one instance can make several. */
const makeBackup = async (i: Instance, passphrase?: Buffer) =>
  readFileSync(
    (
      await runBackup({
        appDir: i.dir,
        env: {},
        callerCwd: i.dir,
        out: mkdtempSync(join(i.dir, "out-")),
        settings: true,
        log: quiet,
        now: () => NOW,
        ...(passphrase ? { passphrase } : {}),
      })
    ).path,
  );

type Entry = { path: string; bytes: Uint8Array };

/** The archive's entries, in order. */
const entriesOf = (archive: Uint8Array) => {
  const entries: Entry[] = [];
  readTar(archive, (e) => entries.push({ path: e.path, bytes: e.bytes }));
  return entries;
};

/** An archive of these entries, as the backup's writer writes them. */
const tarOf = async (entries: Entry[]) => {
  const chunks: Uint8Array[] = [];
  const tar = createTarWriter((chunk) => {
    chunks.push(chunk.slice());
  });
  for (const e of entries) await tar.addFile(e.path, e.bytes);
  await tar.end();
  return Buffer.concat(chunks);
};

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value)}\n`);
const parse = <T>(entry: Entry | undefined) =>
  JSON.parse(new TextDecoder().decode(entry?.bytes)) as T;

/** Rewrites the manifest's files, storage and tables from the entries, so only one rule breaks. */
const fixManifest = (entries: Entry[], edit: (m: BackupManifest) => void = () => undefined) => {
  const at = entries.findIndex((e) => e.path === "manifest.json");
  const m = parse<BackupManifest>(entries[at]);
  m.files = {};
  m.storage = { files: 0, bytes: 0 };
  for (const e of entries) {
    if (e.path === "backup.json" || e.path === "manifest.json") continue;
    m.files[e.path] = { size: e.bytes.length, sha256: sha256(e.bytes) };
    if (e.path.startsWith("storage/")) {
      m.storage.files++;
      m.storage.bytes += e.bytes.length;
    }
  }
  edit(m);
  entries[at] = { path: "manifest.json", bytes: json(m) };
  return entries;
};

const verify = (
  archive: Uint8Array,
  passphrase: () => Promise<Buffer> = () => Promise.reject(new Error("not asked")),
) => verifyArchive({ source: Readable.from([archive]), passphrase, knownMigrations: KNOWN });

describe("backup --verify (099)", () => {
  it("passes a good archive, says what's in it, and asks no passphrase for a plain one", async () => {
    const i = await instance();
    const archive = await makeBackup(i);
    const result = await verify(archive);
    expect(result.encrypted).toBe(false);
    expect(result.bytes).toBe(archive.length);
    expect(result.info.migrations).toEqual(KNOWN);
    expect(result.manifest.missingArtifacts.map((a) => a.version)).toEqual(["1.1.0"]);

    // Through the command: the archive from where it was typed, and the summary.
    const lines: string[] = [];
    writeFileSync(join(i.dir, "b.tar"), archive);
    await runVerify({
      archive: "b.tar",
      callerCwd: i.dir,
      passphrase: () => Promise.reject(new Error("not asked")),
      log: { info: (m) => lines.push(m), warn: (m) => lines.push(`! ${m}`) },
    });
    const text = lines.join("\n");
    expect(text).toContain("b.tar is complete: every checksum matches.");
    expect(text).toMatch(/\d+ rows in \d+ tables, 1 stored file \(\d+ B\), with the settings file/);
    expect(text).toContain("! 1 released version had no artifact in storage when it was made");
    expect(text).toContain("@incident/notes 1.1.0");
  });

  it("decrypts an encrypted archive with its passphrase, and refuses another", async () => {
    const i = await instance();
    const secret = passphraseBytes("verify passphrase");
    const sealed = await makeBackup(i, secret);
    let asked = 0;
    const result = await verify(sealed, async () => {
      asked++;
      return secret;
    });
    expect(result.encrypted).toBe(true);
    expect(asked).toBe(1);
    await expect(verify(sealed, async () => passphraseBytes("a guess"))).rejects.toThrow(
      /damaged, or the passphrase is wrong/,
    );
    // A newer container is said before any passphrase is asked for.
    const newer = Buffer.from(sealed);
    newer[8] = 2;
    await expect(verify(newer)).rejects.toThrow(/encrypted by a newer Ronne/);
  });

  it("refuses an altered file: its checksum doesn't match the manifest", async () => {
    const i = await instance();
    const entries = entriesOf(await makeBackup(i));
    const part = entries.find((e) => e.path.startsWith("database/user/")) as Entry;
    // Still valid JSON with the same columns: only the checksum can tell.
    part.bytes = new TextEncoder().encode(
      new TextDecoder().decode(part.bytes).replace("root@example.com", "toor@example.com"),
    );
    await expect(verify(await tarOf(entries))).rejects.toThrow(
      /database\/user\/000001\.jsonl doesn't match its checksum in the manifest/,
    );
    // A byte flipped in the raw archive, inside the stored artifact's bytes.
    const raw = Buffer.from(await makeBackup(i));
    const at = raw.indexOf(Buffer.from(ARTIFACT));
    raw[at] = (raw[at] as number) ^ 0x01;
    await expect(verify(raw)).rejects.toThrow(
      /storage\/incident\/notes\/1\.0\.0\.tgz doesn't match its checksum/,
    );
  });

  it("refuses a released version's artifact missing from the archive and its list", async () => {
    const i = await instance();
    const entries = entriesOf(await makeBackup(i)).filter(
      (e) => e.path !== "storage/incident/notes/1.0.0.tgz",
    );
    await expect(verify(await tarOf(fixManifest(entries)))).rejects.toThrow(
      /artifact, incident\/notes\/1\.0\.0\.tgz, is missing from the archive and from its list/,
    );
    // Listed as missing, it passes (the backup ran while it was missing from storage).
    const listed = fixManifest(entries, (m) => {
      m.missingArtifacts.push({
        item: "@incident/notes",
        version: "1.0.0",
        path: "incident/notes/1.0.0.tgz",
      });
    });
    expect((await verify(await tarOf(listed))).manifest.missingArtifacts).toHaveLength(2);
    // Present with another sha256 than its row records.
    const swapped = entriesOf(await makeBackup(i)).map((e) =>
      e.path === "storage/incident/notes/1.0.0.tgz"
        ? { ...e, bytes: new TextEncoder().encode("other") }
        : e,
    );
    await expect(verify(await tarOf(fixManifest(swapped)))).rejects.toThrow(
      /has another sha256 than its database row records/,
    );
  });

  it("refuses a newer backup format, and migrations this Ronne doesn't have", async () => {
    const i = await instance();
    const entries = entriesOf(await makeBackup(i));
    const info = parse<Record<string, unknown>>(entries[0]);
    const newer = [
      { path: "backup.json", bytes: json({ ...info, format: 2, ronne: "9.0.0" }) },
      ...entries.slice(1),
    ];
    await expect(verify(await tarOf(newer))).rejects.toThrow(
      "This backup was made by Ronne 9.0.0 in backup format 2; install that version or newer to read it.",
    );
    const ahead = [
      {
        path: "backup.json",
        bytes: json({ ...info, ronne: "9.0.0", migrations: [...KNOWN, "9999_future"] }),
      },
      ...entries.slice(1),
    ];
    await expect(verify(await tarOf(ahead))).rejects.toThrow(
      "This backup comes from a newer Ronne (9.0.0); install that version or newer to restore it.",
    );
    // An older Ronne's backup (a prefix of the migrations) passes.
    const older = [
      { path: "backup.json", bytes: json({ ...info, migrations: KNOWN.slice(0, 5) }) },
      ...entries.slice(1),
    ];
    expect((await verify(await tarOf(older))).info.migrations).toHaveLength(5);
  });

  it("refuses an archive out of the format's order or shape", async () => {
    const i = await instance();
    const good = entriesOf(await makeBackup(i));
    const without = (path: string) => good.filter((e) => e.path !== path);
    const manifest = good.find((e) => e.path === "manifest.json") as Entry;
    const settings = good.find((e) => e.path === "settings.env") as Entry;
    const userPart = good.find((e) => e.path === "database/user/000001.jsonl") as Entry;
    const cases: Record<string, [Entry[], RegExp]> = {
      "no backup.json first": [good.slice(1), /doesn't start with backup\.json/],
      "manifest not last": [
        [...without("manifest.json").slice(0, 2), manifest, ...without("manifest.json").slice(2)],
        /out of the format's order|after manifest\.json/,
      ],
      "settings before storage": [
        [
          ...without("settings.env").filter(
            (e) => !e.path.startsWith("storage/") && e.path !== "manifest.json",
          ),
          settings,
          ...good.filter((e) => e.path.startsWith("storage/")),
          manifest,
        ],
        /out of the format's order/,
      ],
      "an entry after the manifest": [
        [...good, { path: "storage/late.tgz", bytes: new Uint8Array(1) }],
        /after manifest\.json/,
      ],
      "an entry the format doesn't have": [
        [good[0] as Entry, { path: "extra.txt", bytes: new Uint8Array(1) }, ...good.slice(1)],
        /isn't an entry a Ronne backup holds/,
      ],
      "a part numbered with a gap": [
        good.map((e) => (e === userPart ? { ...e, path: "database/user/000002.jsonl" } : e)),
        /out of order: parts are numbered/,
      ],
      "a row with a column too many": [
        fixManifest(
          good.map((e) =>
            e === userPart
              ? { ...e, bytes: json({ ...parse<Record<string, unknown>>(e), extra: 1 }) }
              : e,
          ),
        ),
        /doesn't have exactly the columns its manifest lists/,
      ],
      "no manifest": [without("manifest.json"), /no manifest\.json/],
      // Two columns' names joined by NUL in one key: still not the table's columns.
      "two columns in one key": [
        fixManifest(
          good.map((e) => {
            if (e !== userPart) return e;
            const row = parse<Record<string, unknown>>(e);
            const [a, b] = Object.keys(row).sort() as [string, string];
            const { [a]: first, [b]: second, ...rest } = row;
            void first;
            void second;
            return { ...e, bytes: json({ ...rest, [`${a}\u0000${b}`]: 1 }) };
          }),
        ),
        /doesn't have exactly the columns its manifest lists/,
      ],
    };
    for (const [what, [entries, message]] of Object.entries(cases))
      await expect(verify(await tarOf(entries)), what).rejects.toThrow(message);

    // A cut archive, at several lengths.
    const archive = await makeBackup(i);
    for (const length of [0, 100, 512, Math.floor(archive.length / 2), archive.length - 1024])
      await expect(verify(archive.subarray(0, length)), `cut to ${length}`).rejects.toThrow();
  });

  it("names the file when it can't be read", async () => {
    const i = await instance();
    await expect(
      runVerify({
        archive: "nope.tar",
        callerCwd: i.dir,
        passphrase: async () => Buffer.alloc(1),
        log: quiet,
      }),
    ).rejects.toThrow(VerifyFailedError);
  });
});
