import type { CatalogueRevision } from "../../../db/catalogue-revision";

/** What the plugin feeds read and record in the database (079). Kysely in kysely-feed-repository.ts. */
export interface FeedRepository {
  /** The catalogue revision: raised with every change that can change a feed, and this database's id. */
  revision(): Promise<CatalogueRevision>;
}
