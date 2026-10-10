import { formatItemName, parseItemName } from "@ronneai/core";
import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import { upsertAdding } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import type { Viewer } from "../../workspaces/models/viewer";
import { inVisibleWorkspace, isVisibleItem } from "../../workspaces/repositories/visible";
import type { UsageRepository } from "./usage-repository";

const KEY = ["item_id", "day", "version", "tool", "event", "run_trigger", "outcome"] as const;

/**
 * Usage as `viewer` reads and reports it (093): a report counts only for items the reporter sees,
 * and an item's usage is read only when the reader sees the item. Writing and pruning don't filter.
 */
export const kyselyUsageRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  viewer: Viewer,
): UsageRepository => ({
  async publishedVersions(names) {
    const found = new Map<string, { itemId: string; versions: Set<string> }>();
    const refs = names.map((name) => parseItemName(name)).filter((parsed) => parsed !== null);
    if (refs.length === 0) return found;
    const versions = () =>
      db
        .selectFrom("items")
        .innerJoin("scopes", "scopes.id", "items.scope_id")
        .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
        .innerJoin("item_versions", "item_versions.item_id", "items.id")
        .where(inVisibleWorkspace(viewer, "scopes.workspace_id"));
    // By the names items have now, and by old ones (118): a lockfile may still say either.
    const current = await versions()
      .select([
        "items.id",
        "workspaces.name as workspace",
        "scopes.name as scope",
        "items.name",
        "item_versions.version",
      ])
      .where((eb) =>
        eb.or(
          refs.map(({ workspace, scope, name }) =>
            eb.and([
              eb("workspaces.name", "=", workspace),
              eb("scopes.name", "=", scope),
              eb("items.name", "=", name),
            ]),
          ),
        ),
      )
      .execute();
    const old = await versions()
      .innerJoin("item_aliases", "item_aliases.item_id", "items.id")
      .select(["items.id", "item_aliases.name as alias", "item_versions.version"])
      .where("item_aliases.name", "in", refs.map(formatItemName))
      .execute();
    const rows = [
      ...current.map((row) => ({ ...row, key: formatItemName(row) })),
      ...old.map((row) => ({ ...row, key: row.alias })),
    ];
    for (const row of rows) {
      const entry = found.get(row.key) ?? { itemId: row.id, versions: new Set<string>() };
      entry.versions.add(row.version);
      found.set(row.key, entry);
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
      .where(isVisibleItem(viewer, "usage_daily.item_id"))
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
      .where(isVisibleItem(viewer, "usage_daily.item_id"))
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  },
});
