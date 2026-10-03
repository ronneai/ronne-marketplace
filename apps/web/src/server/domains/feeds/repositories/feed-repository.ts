import type { PluginTool } from "@ronneai/core/plugins";
import type { CatalogueRevision } from "../../../db/catalogue-revision";
import type { FeedStats } from "../models/feed";

/** What the plugin feeds read and record in the database (079). Kysely in kysely-feed-repository.ts. */
export interface FeedRepository {
  /** The catalogue revision: raised with every change that can change a feed, and this database's id. */
  revision(): Promise<CatalogueRevision>;
  /** Replaces the tool's last build. */
  recordBuild(stats: FeedStats): Promise<void>;
  /**
   * Marks the tool as warned about `revision`: true only for the first caller, in any process, so
   * a warning is logged once per revision.
   */
  markWarned(tool: PluginTool, revision: number): Promise<boolean>;
  /** Every tool's last build, by tool. */
  stats(): Promise<FeedStats[]>;
}
