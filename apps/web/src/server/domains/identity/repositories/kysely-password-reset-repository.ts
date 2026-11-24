import type { Db } from "../../../db/create-db";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { readCommittedTransaction } from "../../../db/locks";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { recipientHmac } from "../../mail/models/outbox";
import { kyselyOutboxRepository } from "../../mail/repositories/kysely-outbox-repository";
import { storedMailSetup } from "../../mail/services/mail-setup";
import { mailQueued } from "../../mail/services/notices";
import { type QueuedMail, type QueueResult, queueMail } from "../../mail/services/outbox";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { effectivePasswordPolicyIn } from "../actions/password-policy";
import { emailHmac } from "../models/email-code";
import { RESET_PURPOSE, type ResetAccount, type ResetStep } from "../models/password-reset";
import { kyselyChallengeRepository } from "./kysely-challenge-repository";
import { kyselyEmailCodeRepository } from "./kysely-email-code-repository";
import type { PasswordResetRepository, ResetFlow } from "./password-reset-repository";

/**
 * Forgot password by email's storage (194). `transaction` runs the work in one read-committed
 * transaction and, once it has committed, hands the emails it queued to the scheduler (189).
 */
export const kyselyPasswordResetRepository = (
  db: Db,
  dialect: DatabaseDialect,
  authSecret: string,
  queued?: string[],
): PasswordResetRepository => {
  const at = (date: Date) => toDbDate(date, dialect);
  const codes = kyselyEmailCodeRepository(db, dialect, authSecret);
  /** An account as a reset reads it, by address or by id. */
  const account = async (by: "email" | "id", value: string): Promise<ResetAccount | null> => {
    const user = await db
      .selectFrom("user")
      .select(["id", "email", "role", "disabled_at", "erased_at", "approval_pending_at"])
      .where(by, "=", value)
      .executeTakeFirst();
    if (!user) return null;
    const links = await db
      .selectFrom("account")
      .leftJoin("identity_providers", "identity_providers.id", "account.provider_id")
      .select(["account.provider_id", "account.password", "identity_providers.name"])
      .where("account.user_id", "=", user.id)
      .execute();
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      disabled: user.disabled_at !== null,
      erased: user.erased_at !== null,
      approvalPending: user.approval_pending_at !== null,
      hasPassword: links.some((l) => l.provider_id === "credential" && l.password !== null),
      providers: links
        .filter((l) => l.provider_id !== "credential" && l.name)
        .map((l) => l.name as string),
    };
  };
  const repo: PasswordResetRepository = {
    async transaction(work) {
      const ids: string[] = queued ?? [];
      const result = await readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyPasswordResetRepository(trx, dialect, authSecret, ids)),
      );
      if (!queued) mailQueued(ids);
      return result;
    },

    findAccount: (email: string) => account("email", email),
    accountById: (userId: string) => account("id", userId),

    async flowByToken(tokenHash: string): Promise<ResetFlow | null> {
      const row = await db
        .selectFrom("password_reset_flows")
        .selectAll()
        .where("token_hash", "=", tokenHash)
        .executeTakeFirst();
      // The column compares without case on MySQL; a hash is lower-case hex, compared exactly.
      if (!row || row.token_hash !== tokenHash) return null;
      return {
        id: row.id,
        tokenHash: row.token_hash,
        userId: row.user_id,
        step: row.step as ResetStep,
        expiresAt: fromDbDate(row.expires_at),
        twoFactorAt: row.two_factor_at ? fromDbDate(row.two_factor_at) : null,
        createdAt: fromDbDate(row.created_at),
      };
    },

    async advanceFlow(id, fromHash, to): Promise<boolean> {
      const moved = await db
        .updateTable("password_reset_flows")
        .set({
          token_hash: to.tokenHash,
          step: to.step,
          expires_at: at(to.expiresAt),
          ...(to.twoFactorAt ? { two_factor_at: at(to.twoFactorAt) } : {}),
        })
        .where("id", "=", id)
        .where("token_hash", "=", fromHash)
        .executeTakeFirst();
      return Number(moved.numUpdatedRows) === 1;
    },

    async endFlow(id: string, now: Date): Promise<void> {
      await db.deleteFrom("password_reset_flows").where("id", "=", id).execute();
      await db
        .updateTable("email_codes")
        .set({ consumed_at: at(now) })
        .where("purpose", "=", RESET_PURPOSE)
        .where("subject_id", "=", id)
        .where("consumed_at", "is", null)
        .execute();
    },

    async wrongCodeTimes(userId: string, since: Date): Promise<Date[]> {
      // The account's own record of its wrong reset codes (`auth.password_reset_code_failed`,
      // `wrong`): it outlives the flows and the codes, and follows the account
      // through a change of address.
      const rows = await db
        .selectFrom("audit_log")
        .select(["metadata", "created_at"])
        .where("action", "=", "auth.password_reset_code_failed")
        .where("target_type", "=", "user")
        .where("target_id", "=", userId)
        .where("created_at", ">", at(since))
        .orderBy("created_at")
        .execute();
      return rows
        .filter((r) => {
          try {
            const reason = (JSON.parse(r.metadata) as { reason?: unknown }).reason;
            // Tries during a pause aren't counted: the pause lasts a day after the 20th, as said.
            return reason === "wrong";
          } catch {
            return false;
          }
        })
        .map((r) => fromDbDate(r.created_at));
    },

    verifyCode: codes.verify,
    passwordPolicy: () => effectivePasswordPolicyIn(db, dialect),

    async enabledProviderNames(): Promise<string[]> {
      const rows = await db
        .selectFrom("identity_providers")
        .select("name")
        .where("enabled", "=", toDbBoolean(true, dialect))
        .orderBy("name")
        .execute();
      return rows.map((r) => r.name);
    },

    async insertFlow(flow: ResetFlow): Promise<void> {
      await db
        .insertInto("password_reset_flows")
        .values({
          id: flow.id,
          token_hash: flow.tokenHash,
          user_id: flow.userId,
          step: flow.step,
          expires_at: at(flow.expiresAt),
          two_factor_at: flow.twoFactorAt ? at(flow.twoFactorAt) : null,
          created_at: at(flow.createdAt),
        })
        .execute();
    },

    async lockAccount(userId: string): Promise<void> {
      if (dialect === "sqlite") return;
      await db.selectFrom("user").select("id").where("id", "=", userId).forUpdate().execute();
    },

    async endCodesFor(email: string, now: Date): Promise<void> {
      await db
        .updateTable("email_codes")
        .set({ consumed_at: at(now) })
        .where("purpose", "=", RESET_PURPOSE)
        .where("email_hmac", "=", emailHmac(authSecret, email))
        .where("consumed_at", "is", null)
        .execute();
    },

    issueCode: codes.issue,

    takeChallenge: (challengeHmac: string, expiresAt: Date) =>
      kyselyChallengeRepository(db, dialect).take(challengeHmac, expiresAt),

    async rehearseMail(mail, now) {
      await storedMailSetup(kyselySettingsRepository(db, dialect));
      await kyselyOutboxRepository(db, dialect).countSince(
        recipientHmac(authSecret, mail.to),
        new Date(now.getTime() - 60 * 60_000),
      );
    },

    async queueMail(mail: QueuedMail, now: Date): Promise<QueueResult> {
      const result = await queueMail(db, dialect, authSecret, mail, now);
      if (result.queued) (queued ?? []).push(result.id);
      return result;
    },

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
  return repo;
};
