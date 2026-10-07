import type { PluginTool } from "@ronneai/core/plugins";
import type { CatalogueRevision } from "../../../db/catalogue-revision";
import type { FeedStats } from "../models/feed";

/** What the plugin feeds read and record in the database (079). Kysely in kysely-feed-repository.ts. */
export interface FeedRepository {
  /** The catalogue revision: raised with every change that can change a feed, and this database's id. */
  revision(): Promise<CatalogueRevision>;
  /**
   * Records a tool's complete build: it replaces a build of an older revision, or a smaller one of
   * the same revision, so each tool keeps its largest marketplace across visibility keys (093).
   */
  recordBuild(stats: FeedStats): Promise<void>;
  /**
   * Marks the tool as warned about `revision`: true only for the first caller, in any process, so
   * a warning is logged once per revision.
   */
  markWarned(tool: PluginTool, revision: number): Promise<boolean>;
  /** Every tool's recorded build, by tool. */
  stats(): Promise<FeedStats[]>;
}
