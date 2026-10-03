import type { PluginTool } from "@ronneai/core/plugins";
import { requirePermission } from "../../identity/models/permissions";
import type { VersionActor } from "../../items/services/versions";
import { type FeedStats, type FeedWarning, feedWarnings, SERVED_TOOLS } from "../models/feed";
import type { FeedRepository } from "../repositories/feed-repository";

/** One tool's line in Admin › Settings › Plugin feeds (079). */
export type FeedStatsRow = {
  tool: PluginTool;
  /** Its marketplace's last complete build, or null when none was built yet. */
  stats: FeedStats | null;
  warnings: FeedWarning[];
};

/** Every served tool's last build and the limits it came near, for root (`settings.manage`). */
export const feedStatsFor = async (
  deps: { feeds: FeedRepository },
  actor: VersionActor,
): Promise<FeedStatsRow[]> => {
  requirePermission(actor.user, "settings.manage");
  const rows = await deps.feeds.stats();
  return SERVED_TOOLS.map((tool) => {
    const stats = rows.find((row) => row.tool === tool) ?? null;
    return { tool, stats, warnings: stats ? feedWarnings(stats) : [] };
  });
};
