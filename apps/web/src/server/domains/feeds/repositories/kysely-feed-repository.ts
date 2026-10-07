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
    const row = {
      size_bytes: stats.sizeBytes,
      plugins: stats.plugins,
      build_ms: Math.round(stats.buildMs),
      revision: stats.revision,
      built_at: toDbDate(stats.builtAt, dialect),
    };
    // Replace an older revision's build, or a smaller one of this revision, in one statement, so
    // two keys' builds at once can't swap the larger for the smaller.
    const replace = async () =>
      Number(
        (
          await db
            .updateTable("plugin_feeds")
            .set(row)
            .where("tool", "=", stats.tool)
            .where((eb) =>
              eb.or([
                eb("revision", "<", stats.revision),
                eb.and([
                  eb("revision", "=", stats.revision),
                  eb("size_bytes", "<=", stats.sizeBytes),
                ]),
              ]),
            )
            .executeTakeFirst()
        ).numUpdatedRows,
      ) > 0;
    if (await replace()) return;
    // No row to replace: the tool's first build, or a newer or larger one is already there. Insert
    // it if there's none (an update of `tool` to itself changes nothing), then try again: another
    // first build may have inserted a smaller one in between.
    await upsert(
      db,
      dialect,
      "plugin_feeds",
      { tool: stats.tool, ...row },
      ["tool"],
      ["tool"],
    ).execute();
    await replace();
  },

  markWarned: async (tool, revision) => {
    const result = await db
      .updateTable("plugin_feeds")
      .set({ warned_revision: revision })
      .where("tool", "=", tool)
      .where((eb) =>
        // Only forward: a request still on an older revision mustn't re-arm the newer one's warning.
        eb.or([eb("warned_revision", "is", null), eb("warned_revision", "<", revision)]),
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
