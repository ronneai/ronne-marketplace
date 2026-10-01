import { parseItemName } from "@ronneai/core";
import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import { upsertAdding } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import type { UsageRepository } from "./usage-repository";

const KEY = ["item_id", "day", "version", "tool", "event", "run_trigger", "outcome"] as const;

export const kyselyUsageRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): UsageRepository => ({
  async publishedVersions(names) {
    const found = new Map<string, { itemId: string; versions: Set<string> }>();
    const pairs = names.map((name) => parseItemName(name)).filter((parsed) => parsed !== null);
    if (pairs.length === 0) return found;
    const rows = await db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .innerJoin("item_versions", "item_versions.item_id", "items.id")
      .select(["items.id", "scopes.name as scope", "items.name", "item_versions.version"])
      .where((eb) =>
        eb.or(
          pairs.map(({ scope, name }) =>
            eb.and([eb("scopes.name", "=", scope), eb("items.name", "=", name)]),
          ),
        ),
      )
      .execute();
    for (const row of rows) {
      const key = `@${row.scope}/${row.name}`;
      const entry = found.get(key) ?? { itemId: row.id, versions: new Set<string>() };
      entry.versions.add(row.version);
      found.set(key, entry);
    }
    return found;
  },

  async add(rows) {
    if (rows.length === 0) return;
    // One statement per row: each is an insert-or-add, and a report is at most 500 lines.
    await db.transaction().execute(async (trx) => {
      for (const row of rows)
        await upsertAdding(
          trx,
          dialect,
          "usage_daily",
          {
            item_id: row.itemId,
            day: row.day,
            version: row.version,
            tool: row.tool,
            event: row.event,
            run_trigger: row.trigger,
            outcome: row.outcome,
            count: row.count,
          },
          KEY,
          ["count"],
        ).execute();
    });
  },

  async deleteBefore(day) {
    await db.deleteFrom("usage_daily").where("day", "<", day).execute();
  },

  async rowsBetween(itemId, from, to) {
    const rows = await db
      .selectFrom("usage_daily")
      .select(["day", "version", "tool", "event", "run_trigger", "outcome", "count"])
      .where("item_id", "=", itemId)
      .where("day", ">=", from)
      .where("day", "<=", to)
      .execute();
    return rows.map((r) => ({
      itemId,
      day: r.day,
      version: r.version,
      tool: r.tool,
      event: r.event,
      trigger: r.run_trigger,
      outcome: r.outcome,
      count: Number(r.count),
    }));
  },

  async hasAny(itemId) {
    const row = await db
      .selectFrom("usage_daily")
      .select("item_id")
      .where("item_id", "=", itemId)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  },
});
