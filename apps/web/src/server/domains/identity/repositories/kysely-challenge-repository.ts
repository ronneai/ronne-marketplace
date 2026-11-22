import type { Db } from "../../../db/create-db";
import { toDbDate } from "../../../db/dates";
import type { DatabaseDialect } from "../../../db/url";

/**
 * Proof-of-work answers already taken (190). Taking one is a single insert keyed by its HMAC, so
 * an answer sent twice, at once on two replicas included, is taken once.
 */
export const kyselyChallengeRepository = (db: Db, dialect: DatabaseDialect) => ({
  /** True when this answer is new and now taken; false when it was taken before (a replay). */
  async take(challengeHmac: string, expiresAt: Date): Promise<boolean> {
    const insert = db
      .insertInto("challenges_used")
      .values({ challenge_hmac: challengeHmac, expires_at: toDbDate(expiresAt, dialect) });
    const result = await (dialect === "mysql"
      ? insert.ignore()
      : insert.onConflict((oc) => oc.column("challenge_hmac").doNothing())
    ).executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows ?? 0) === 1;
  },
});
