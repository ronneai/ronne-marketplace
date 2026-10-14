// Measures the backup's database dump (feature 099) on 079's data set: how long it takes and how
// much memory it holds while it streams every table into a tar file, at each item count. The heap
// should stay flat as the instance grows: the dump reads in batches and writes parts as it goes.
// Run with `pnpm --filter @ronneai/web bench:backup [--items 1000,10000] [--db sqlite|postgres|mysql]`.

import { once } from "node:events";
import { createWriteStream, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createTarWriter } from "@ronneai/core/pack";
import type { Kysely } from "kysely";
import { toDbDate } from "../src/server/db/dates";
import { dumpDatabase } from "../src/server/db/dump";
import { createTestDb } from "../src/server/db/testing/test-db";
import { SERVERS, seedSkills } from "./bench-seed";

const { values } = parseArgs({
  options: {
    items: { type: "string", default: "1000,10000" },
    db: { type: "string", default: "sqlite" },
    // A draft's files too, wide rows (up to 20 MiB each): `--wide-rows 1000 --wide-kib 1024`.
    "wide-rows": { type: "string", default: "0" },
    "wide-kib": { type: "string", default: "1024" },
  },
});
const counts = (values.items ?? "")
  .split(",")
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const db = values.db ?? "sqlite";
const wideRows = Number(values["wide-rows"]);
const wideKib = Number(values["wide-kib"]);
if (!counts.length || !(db in SERVERS) || !(wideRows >= 0) || !(wideKib > 0)) {
  console.error(
    "Usage: bench:backup [--items 1000,10000] [--db sqlite|postgres|mysql] [--wide-rows 0] [--wide-kib 1024]",
  );
  process.exit(2);
}
if (SERVERS[db]) process.env.TEST_DATABASE_URL = SERVERS[db];
else delete process.env.TEST_DATABASE_URL;

const MiB = 1024 * 1024;
const mib = (bytes: number) => (bytes / MiB).toFixed(1);
const collect = () => (globalThis as { gc?: () => void }).gc?.();

const rows: string[] = [];
for (const count of counts) {
  const t = await createTestDb({ fresh: true });
  const dir = mkdtempSync(join(tmpdir(), "ronne-backup-bench-"));
  try {
    await seedSkills(t, join(dir, "storage"), count);
    // Wide rows where the app keeps them: a draft's files (longtext in MySQL), in one draft.
    const wide = "w".repeat(wideKib * 1024);
    if (wideRows > 0) {
      const author = await t.db
        .selectFrom("user")
        .select("id")
        .where("email", "=", "bench@example.com")
        .executeTakeFirstOrThrow();
      const now = toDbDate(new Date(), t.dialect);
      await t.db
        .insertInto("submissions")
        .values({
          id: "bench-wide-draft",
          author_id: author.id,
          scope_id: "bench-scope",
          name: "wide",
          type: "skill",
          item_id: null,
          base_version_id: null,
          status: "draft",
          created_at: now,
          updated_at: now,
          submitted_at: null,
          rebase_conflicts: null,
        } as never)
        .execute();
      for (let i = 0; i < wideRows; i++)
        await t.db
          .insertInto("submission_files")
          .values({
            submission_id: "bench-wide-draft",
            path: `files/${String(i).padStart(6, "0")}.md`,
            encoding: "utf8",
            content: wide,
            size: wide.length,
            executable: t.dialect === "sqlite" ? 0 : false,
            updated_at: now,
          } as never)
          .execute();
    }
    collect();
    const baseline = process.memoryUsage().heapUsed;
    let peak = baseline;
    const sampler = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().heapUsed);
    }, 10);

    const file = join(dir, "backup.tar");
    const out = createWriteStream(file);
    // Waits for the file to drain when its buffer is full, as the backup command will.
    const tar = createTarWriter(async (chunk) => {
      if (!out.write(chunk)) await once(out, "drain");
    });
    const started = performance.now();
    let parts = 0;
    // What the dump really holds: the heap right after a full collection, at each part.
    let live = 0;
    const { tables } = await dumpDatabase(
      t.db as unknown as Kysely<unknown>,
      t.dialect,
      (path, bytes) => {
        parts++;
        peak = Math.max(peak, process.memoryUsage().heapUsed);
        collect();
        live = Math.max(live, process.memoryUsage().heapUsed - baseline);
        return tar.addFile(path, bytes);
      },
    );
    await tar.end();
    out.end();
    await once(out, "finish");
    const ms = performance.now() - started;
    clearInterval(sampler);

    const total = Object.values(tables).reduce((sum, table) => sum + table.rows, 0);
    rows.push(
      `| ${db} | ${count} | ${total} | ${parts} | ${mib(statSync(file).size)} | ${(ms / 1000).toFixed(2)} | ${mib(peak - baseline)} | ${mib(live)} |`,
    );
    console.error(rows.at(-1));
  } finally {
    await t.cleanup();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(
  "| Database | Items | Rows | Parts | Archive (MiB) | Dump (s) | Heap above baseline, peak (MiB) | Held after a collection, most (MiB) |",
);
console.log("|---|---|---|---|---|---|---|---|");
for (const row of rows) console.log(row);
