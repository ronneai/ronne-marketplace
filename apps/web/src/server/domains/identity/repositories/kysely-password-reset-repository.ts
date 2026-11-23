import type { Db } from "../../../db/create-db";
import { toDbBoolean, toDbDate } from "../../../db/dates";
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
import { RESET_PURPOSE, type ResetAccount } from "../models/password-reset";
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
  const repo: PasswordResetRepository = {
    async transaction(work) {
      const ids: string[] = queued ?? [];
      const result = await readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselyPasswordResetRepository(trx, dialect, authSecret, ids)),
      );
      if (!queued) mailQueued(ids);
      return result;
    },

    async findAccount(email: string): Promise<ResetAccount | null> {
      const user = await db
        .selectFrom("user")
        .select(["id", "email", "role", "disabled_at", "erased_at", "approval_pending_at"])
        .where("email", "=", email)
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
    },

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
          created_at: at(flow.createdAt),
        })
        .execute();
    },

    async lockAccount(userId: string): Promise<void> {
      if (dialect === "sqlite") return;
      await db.selectFrom("user").select("id").where("id", "=", userId).forUpdate().execute();
    },

    async endCodesOf(userId: string, now: Date): Promise<void> {
      const flows = db
        .selectFrom("password_reset_flows")
        .select("id")
        .where("user_id", "=", userId);
      await db
        .updateTable("email_codes")
        .set({ consumed_at: at(now) })
        .where("purpose", "=", RESET_PURPOSE)
        .where("subject_id", "in", flows)
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
