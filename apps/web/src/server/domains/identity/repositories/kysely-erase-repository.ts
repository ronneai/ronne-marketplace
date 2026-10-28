import type { Kysely } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { decodeJson, encodeJson } from "../../../db/json";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import {
  clearAuditIpsOf,
  rewriteErasedEmail,
  rewritesAfterCommit,
} from "../../audit/repositories/kysely-audit-rewrite";
import { kyselyWorkspaceRepository } from "../../workspaces/repositories/kysely-workspace-repository";
import type { EraseRepository } from "./erase-repository";
import { kyselyIdentityRepository } from "./kysely-identity-repository";

const count = (result: { numDeletedRows?: bigint; numUpdatedRows?: bigint }) =>
  Number(result.numDeletedRows ?? result.numUpdatedRows ?? 0);

export const kyselyEraseRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  options: { inTransaction?: boolean } = {},
): EraseRepository => {
  const at = (date: Date) => toDbDate(date, dialect);
  const inTransaction = options.inTransaction ?? false;
  return {
    transaction: (work) =>
      readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyEraseRepository(trx, dialect, { inTransaction: true })),
      ),
    identity: kyselyIdentityRepository(db, dialect),
    workspaces: kyselyWorkspaceRepository(db, dialect),
    rewritesAfterCommit: rewritesAfterCommit(dialect),

    async lockUser(userId) {
      await forUpdate(
        db.selectFrom("user").select("id").where("id", "=", userId),
        dialect,
      ).execute();
      return kyselyIdentityRepository(db, dialect).findUser(userId);
    },

    async anonymizeUser(userId, pseudonym, now) {
      await db
        .updateTable("user")
        .set({
          email: pseudonym.email,
          name: pseudonym.name,
          image: null,
          email_verified: toDbBoolean(false, dialect),
          two_factor_enabled: toDbBoolean(false, dialect),
          locale: null,
          role: "user",
          erased_at: at(now),
          updated_at: at(now),
        })
        .where("id", "=", userId)
        .execute();
      await db
        .updateTable("user")
        .set({ disabled_at: at(now) })
        .where("id", "=", userId)
        .where("disabled_at", "is", null)
        .execute();
    },

    async deleteCredentials(userId, email) {
      await db.deleteFrom("account").where("user_id", "=", userId).execute();
      await db.deleteFrom("two_factor").where("user_id", "=", userId).execute();
      await db
        .deleteFrom("verification")
        .where("identifier", "in", [`two-factor-setup:${userId}`, email])
        .execute();
    },

    async deleteAccessTokens(userId) {
      return count(
        await db.deleteFrom("access_tokens").where("user_id", "=", userId).executeTakeFirst(),
      );
    },

    async deleteDeviceGrants(userId) {
      return count(
        await db.deleteFrom("device_grants").where("user_id", "=", userId).executeTakeFirst(),
      );
    },

    async deleteScimRows(userId) {
      await db.deleteFrom("scim_group_members").where("user_id", "=", userId).execute();
      return count(
        await db.deleteFrom("scim_users").where("user_id", "=", userId).executeTakeFirst(),
      );
    },

    async deleteFavorites(userId) {
      return count(
        await db.deleteFrom("item_favorites").where("user_id", "=", userId).executeTakeFirst(),
      );
    },

    async deleteFeedback(userId) {
      return count(
        await db.deleteFrom("feedback").where("user_id", "=", userId).executeTakeFirst(),
      );
    },

    async deleteOnboarding(userId) {
      await db.deleteFrom("user_onboarding").where("user_id", "=", userId).execute();
    },

    async deleteMemberships(userId) {
      return count(
        await db.deleteFrom("workspace_members").where("user_id", "=", userId).executeTakeFirst(),
      );
    },

    async cancelScopeMoves(userId, now) {
      return count(
        await db
          .updateTable("scope_moves")
          .set({ status: "cancelled", decided_at: at(now), reason: null })
          .where("requested_by", "=", userId)
          .where("status", "=", "open")
          .executeTakeFirst(),
      );
    },

    async cancelItemMoves(userId, now) {
      return count(
        await db
          .updateTable("item_moves")
          .set({ status: "cancelled", decided_at: at(now), reason: null })
          .where("requested_by", "=", userId)
          .where("status", "=", "open")
          .executeTakeFirst(),
      );
    },

    async deleteDrafts(userId) {
      // The files and revisions go with the row (their foreign keys cascade).
      return count(
        await db
          .deleteFrom("submissions")
          .where("author_id", "=", userId)
          .where("status", "=", "draft")
          .executeTakeFirst(),
      );
    },

    async personalWorkspace(userId) {
      const row = await db
        .selectFrom("workspaces")
        .select(["id", "name"])
        .where("owner_id", "=", userId)
        .executeTakeFirst();
      return row ?? null;
    },

    async holdsRecord(workspaceId) {
      const item = await db
        .selectFrom("items")
        .innerJoin("scopes", "scopes.id", "items.scope_id")
        .select("items.id")
        .where("scopes.workspace_id", "=", workspaceId)
        .executeTakeFirst();
      if (item) return true;
      // Any submission left (the person's own drafts are gone by now): something submitted, or
      // another person's draft, which root may make in any scope; deleting the scope would take it.
      const submission = await db
        .selectFrom("submissions")
        .innerJoin("scopes", "scopes.id", "submissions.scope_id")
        .select("submissions.id")
        .where("scopes.workspace_id", "=", workspaceId)
        .executeTakeFirst();
      return Boolean(submission);
    },

    async deleteEmptyWorkspace(workspaceId) {
      // Its scopes first (their moves cascade); then the row (memberships cascade).
      await db.deleteFrom("scopes").where("workspace_id", "=", workspaceId).execute();
      await db
        .deleteFrom("workspaces")
        .where("id", "=", workspaceId)
        .where("is_global", "=", toDbBoolean(false, dialect))
        .execute();
    },

    clearAuditIps: (userId) => clearAuditIpsOf(db, userId),

    rewriteEmail: (job, options) =>
      rewriteErasedEmail(job, {
        batch: options.batch,
        onBatch: options.onBatch,
        // Inside the erasure's transaction, each page runs on it; after the commit, in its own.
        inBatch: inTransaction ? (work) => work(db) : (work) => db.transaction().execute(work),
      }),

    async insertErasure(row) {
      await db
        .insertInto("user_erasures")
        .values({
          user_id: row.userId,
          email: row.email,
          counts: encodeJson(row.counts),
          actor_id: row.actorId,
          started_at: at(row.startedAt),
        })
        .execute();
    },

    async addRewritten(userId, rows) {
      await db
        .updateTable("user_erasures")
        .set((eb) => ({ events_rewritten: eb("events_rewritten", "+", rows) }))
        .where("user_id", "=", userId)
        .execute();
    },

    async deleteErasure(userId) {
      const row = await db
        .selectFrom("user_erasures")
        .select("events_rewritten")
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!row) return null;
      const deleted = count(
        await db.deleteFrom("user_erasures").where("user_id", "=", userId).executeTakeFirst(),
      );
      return deleted > 0 ? { eventsRewritten: Number(row.events_rewritten) } : null;
    },

    async pendingErasures() {
      const rows = await db
        .selectFrom("user_erasures")
        .selectAll()
        .orderBy("started_at")
        .orderBy("user_id")
        .execute();
      return rows.map((row) => ({
        userId: row.user_id,
        email: row.email,
        counts: decodeJson<Record<string, number | string>>(row.counts),
        eventsRewritten: Number(row.events_rewritten),
        actorId: row.actor_id,
        startedAt: fromDbDate(row.started_at),
      }));
    },

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
};
