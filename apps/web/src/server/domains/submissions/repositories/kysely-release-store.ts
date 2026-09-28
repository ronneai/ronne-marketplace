import type { Kysely } from "kysely";
import { readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { kyselyItemRepository } from "../../items/repositories/kysely-item-repository";
import { kyselySubmissionRepository } from "./kysely-submission-repository";
import type { ReleaseStore } from "./release-store";

export const kyselyReleaseStore = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ReleaseStore => ({
  // READ COMMITTED, as submissions' own transactions: checks after a lock see what just committed.
  transaction: (work) =>
    readCommittedTransaction(db, dialect).execute((trx) =>
      work({
        submissions: kyselySubmissionRepository(trx, dialect),
        items: kyselyItemRepository(trx, dialect),
      }),
    ),
});
