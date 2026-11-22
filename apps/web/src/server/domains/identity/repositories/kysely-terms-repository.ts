import type { Db } from "../../../db/create-db";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { TermsRepository } from "./terms-repository";

/** The terms people accepted (190): one row per acceptance, never updated. */
export const kyselyTermsRepository = (db: Db, dialect: DatabaseDialect): TermsRepository => ({
  transaction: (work) =>
    readCommittedTransaction(db, dialect).execute((trx) =>
      work(kyselyTermsRepository(trx, dialect)),
    ),

  async lockUser(userId) {
    await forUpdate(db.selectFrom("user").select("id").where("id", "=", userId), dialect).execute();
  },

  async accepted(userId, version) {
    const row = await db
      .selectFrom("terms_acceptances")
      .select("id")
      .where("user_id", "=", userId)
      .where("version", "=", version)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  },

  async acceptedSince(userId, at) {
    const row = await db
      .selectFrom("terms_acceptances")
      .select("id")
      .where("user_id", "=", userId)
      .where("accepted_at", ">=", toDbDate(at, dialect))
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  },

  async record(userId, version, at) {
    await db
      .insertInto("terms_acceptances")
      .values({ id: newId(), user_id: userId, version, accepted_at: toDbDate(at, dialect) })
      .execute();
  },

  async recordAudit(event, at) {
    await recordAudit(db, dialect, event, at);
  },
});
