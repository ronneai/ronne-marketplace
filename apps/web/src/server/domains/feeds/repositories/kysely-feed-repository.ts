import type { Kysely } from "kysely";
import { catalogueRevision } from "../../../db/catalogue-revision";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import type { FeedRepository } from "./feed-repository";

export const kyselyFeedRepository = (
  db: Kysely<Database>,
  _dialect: DatabaseDialect,
): FeedRepository => ({
  revision: () => catalogueRevision(db),
});
