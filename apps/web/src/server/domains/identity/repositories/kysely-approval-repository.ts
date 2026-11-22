import type { Db } from "../../../db/create-db";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { mailQueued } from "../../mail/services/notices";
import { queueMail } from "../../mail/services/outbox";
import { createdVia } from "../models/user";
import type { ApprovalRepository } from "./approval-repository";

/** Approving and declining self-registered accounts (190). */
export const kyselyApprovalRepository = (
  db: Db,
  dialect: DatabaseDialect,
  authSecret: string,
  queued?: string[],
): ApprovalRepository => ({
  async transaction(work) {
    const ids: string[] = queued ?? [];
    const result = await readCommittedTransaction(db, dialect).execute((trx) =>
      work(kyselyApprovalRepository(trx, dialect, authSecret, ids)),
    );
    if (!queued) mailQueued(ids);
    return result;
  },

  async lockAccount(userId) {
    const row = await forUpdate(
      db
        .selectFrom("user")
        .select(["id", "email", "locale", "approval_pending_at", "erased_at", "created_via"])
        .where("id", "=", userId),
      dialect,
    ).executeTakeFirst();
    if (!row || row.erased_at) return { state: "gone" };
    if (!row.approval_pending_at) return { state: "approved" };
    // Made by a provider's first sign-in (191): its name, or its id once it's deleted.
    const via = createdVia(row.created_via);
    const providerId = via.startsWith("provider:") ? via.slice(9) : null;
    const provider = providerId
      ? ((
          await db
            .selectFrom("identity_providers")
            .select("name")
            .where("id", "=", providerId)
            .executeTakeFirst()
        )?.name ?? providerId)
      : null;
    return {
      state: "waiting",
      account: {
        id: row.id,
        email: row.email,
        locale: row.locale,
        since: fromDbDate(row.approval_pending_at),
        provider,
      },
    };
  },

  async approve(userId, at) {
    await db
      .updateTable("user")
      .set({ approval_pending_at: null, updated_at: toDbDate(at, dialect) })
      .where("id", "=", userId)
      .execute();
  },

  async deleteWaiting(userId) {
    // What a new account has: its credential, its terms, its memberships (global and its own
    // workspace) and its personal workspace. It never signed in, so nothing else points at it;
    // if something did, the foreign keys would refuse and the decline would roll back.
    await db.deleteFrom("terms_acceptances").where("user_id", "=", userId).execute();
    await db.deleteFrom("session").where("user_id", "=", userId).execute();
    await db.deleteFrom("account").where("user_id", "=", userId).execute();
    await db.deleteFrom("notifications").where("user_id", "=", userId).execute();
    // The roots' notices that it waited (190): answered, they'd keep its address for 90 days.
    await db
      .deleteFrom("notifications")
      .where("subject_type", "=", "user")
      .where("subject_id", "=", userId)
      .execute();
    const personal = await db
      .selectFrom("workspaces")
      .select("id")
      .where("owner_id", "=", userId)
      .execute();
    await db.deleteFrom("workspace_members").where("user_id", "=", userId).execute();
    for (const { id } of personal) {
      await db.deleteFrom("workspace_members").where("workspace_id", "=", id).execute();
      await db.deleteFrom("workspaces").where("id", "=", id).execute();
    }
    await db.deleteFrom("user").where("id", "=", userId).execute();
  },

  async waitingSince(cutoff, limit) {
    const rows = await db
      .selectFrom("user")
      .select("id")
      .where("approval_pending_at", "is not", null)
      .where("approval_pending_at", "<", toDbDate(cutoff, dialect))
      .where("erased_at", "is", null)
      .orderBy("approval_pending_at")
      .orderBy("id")
      .limit(limit)
      .execute();
    return rows.map((row) => row.id);
  },

  async queueMail(mail, now) {
    const result = await queueMail(db, dialect, authSecret, mail, now);
    if (result.queued) (queued ?? []).push(result.id);
    return result;
  },

  async recordAudit(event, now) {
    await recordAudit(db, dialect, event, now);
  },
});
