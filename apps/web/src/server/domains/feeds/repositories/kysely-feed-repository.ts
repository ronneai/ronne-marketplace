import { isPluginTool } from "@ronneai/core/plugins";
import type { Kysely } from "kysely";
import { catalogueRevision } from "../../../db/catalogue-revision";
import { fromDbDate, toDbDate } from "../../../db/dates";
import type { Database } from "../../../db/schema";
import { upsert } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import type { FeedStats } from "../models/feed";
import type { FeedRepository } from "./feed-repository";

export const kyselyFeedRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): FeedRepository => ({
  revision: () => catalogueRevision(db),

  recordBuild: async (stats) => {
    await upsert(
      db,
      dialect,
      "plugin_feeds",
      {
        tool: stats.tool,
        size_bytes: stats.sizeBytes,
        plugins: stats.plugins,
        build_ms: Math.round(stats.buildMs),
        revision: stats.revision,
        built_at: toDbDate(stats.builtAt, dialect),
      },
      ["tool"],
      ["size_bytes", "plugins", "build_ms", "revision", "built_at"],
    ).execute();
  },

  markWarned: async (tool, revision) => {
    const result = await db
      .updateTable("plugin_feeds")
      .set({ warned_revision: revision })
      .where("tool", "=", tool)
      .where((eb) =>
        eb.or([eb("warned_revision", "is", null), eb("warned_revision", "<>", revision)]),
      )
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  },

  stats: async () =>
    (await db.selectFrom("plugin_feeds").selectAll().orderBy("tool").execute()).flatMap(
      (row): FeedStats[] =>
        isPluginTool(row.tool)
          ? [
              {
                tool: row.tool,
                sizeBytes: Number(row.size_bytes),
                plugins: Number(row.plugins),
                buildMs: Number(row.build_ms),
                revision: Number(row.revision),
                builtAt: fromDbDate(row.built_at),
              },
            ]
          : [],
    ),
});
