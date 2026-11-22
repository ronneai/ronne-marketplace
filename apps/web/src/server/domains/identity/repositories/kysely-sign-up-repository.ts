import type { Db } from "../../../db/create-db";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { readCommittedTransaction } from "../../../db/locks";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { recipientHmac } from "../../mail/models/outbox";
import { kyselyOutboxRepository } from "../../mail/repositories/kysely-outbox-repository";
import { storedMailSetup } from "../../mail/services/mail-setup";
import { mailQueued } from "../../mail/services/notices";
import { type QueuedMail, type QueueResult, queueMail } from "../../mail/services/outbox";
import { notify } from "../../notifications/services/notify";
import { activeRoots } from "../../notifications/services/recipients";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { kyselyChallengeRepository } from "./kysely-challenge-repository";
import { kyselyEmailCodeRepository } from "./kysely-email-code-repository";
import { kyselyIdentityRepository } from "./kysely-identity-repository";
import type {
  ExistingAccount,
  NewSignedUpAccount,
  PendingSignUp,
  SignUpRepository,
} from "./sign-up-repository";

/**
 * Self-registration's storage (190). `transaction` runs the work in one read-committed transaction
 * and, once it has committed, hands the emails it queued to the scheduler (189), so a code's email
 * exists if and only if its code does.
 */
export const kyselySignUpRepository = (
  db: Db,
  dialect: DatabaseDialect,
  authSecret: string,
  queued?: string[],
): SignUpRepository => {
  const at = (date: Date) => toDbDate(date, dialect);
  const codes = kyselyEmailCodeRepository(db, dialect, authSecret);
  const repo: SignUpRepository = {
    async transaction(work) {
      const ids: string[] = queued ?? [];
      const result = await readCommittedTransaction(db, dialect).execute((trx) =>
        work(kyselySignUpRepository(trx, dialect, authSecret, ids)),
      );
      if (!queued) mailQueued(ids);
      return result;
    },

    /** The account with this address, compared as the unique index compares it. */
    async findAccount(email: string): Promise<ExistingAccount | null> {
      const row = await db
        .selectFrom("user")
        .select(["id", "email"])
        .where("email", "=", email)
        .executeTakeFirst();
      return row ?? null;
    },

    async insertPending(p: PendingSignUp): Promise<void> {
      await db
        .insertInto("pending_sign_ups")
        .values({
          id: p.id,
          email: p.email,
          name: p.name,
          password_hash: p.passwordHash,
          locale: p.locale,
          terms_version: p.termsVersion,
          terms_accepted_at: p.termsAcceptedAt ? at(p.termsAcceptedAt) : null,
          created_at: at(p.createdAt),
          expires_at: at(p.expiresAt),
        })
        .execute();
    },

    async pending(id: string): Promise<PendingSignUp | null> {
      const row = await db
        .selectFrom("pending_sign_ups")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        passwordHash: row.password_hash,
        locale: row.locale,
        termsVersion: row.terms_version,
        termsAcceptedAt: row.terms_accepted_at ? fromDbDate(row.terms_accepted_at) : null,
        createdAt: fromDbDate(row.created_at),
        expiresAt: fromDbDate(row.expires_at),
      };
    },

    /** Ends a sign-up and its codes. */
    async deletePending(id: string, now: Date): Promise<void> {
      await db.deleteFrom("pending_sign_ups").where("id", "=", id).execute();
      await db
        .updateTable("email_codes")
        .set({ consumed_at: at(now) })
        .where("purpose", "=", "sign_up")
        .where("subject_id", "=", id)
        .where("consumed_at", "is", null)
        .execute();
    },

    async extendPending(id: string, expiresAt: Date): Promise<void> {
      await db
        .updateTable("pending_sign_ups")
        .set({ expires_at: at(expiresAt) })
        .where("id", "=", id)
        .execute();
    },

    /** When the sign-up's latest code was sent, for the page's countdown. */
    async lastCodeAt(id: string): Promise<Date | null> {
      const row = await db
        .selectFrom("email_codes")
        .select("created_at")
        .where("purpose", "=", "sign_up")
        .where("subject_id", "=", id)
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst();
      return row ? fromDbDate(row.created_at) : null;
    },

    issueCode: codes.issue,
    verifyCode: codes.verify,

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

    /**
     * The account a right code makes (190): the same write as Create user (a `user` in `global`,
     * a personal workspace, a credential account), never root, its address proven, its language
     * the sign-up's, waiting for approval when root asks, and the terms it accepted on record.
     */
    async createAccount(input: NewSignedUpAccount): Promise<string> {
      const { now } = input;
      const id = await kyselyIdentityRepository(db, dialect, queued ?? []).createUserWithPassword(
        { email: input.email, name: input.name, role: "user", passwordHash: input.passwordHash },
        now,
      );
      await db
        .updateTable("user")
        .set({
          email_verified: toDbBoolean(true, dialect),
          locale: input.locale,
          signed_up_at: at(now),
          approval_pending_at: input.approval ? at(now) : null,
        })
        .where("id", "=", id)
        .execute();
      if (input.termsVersion)
        await db
          .insertInto("terms_acceptances")
          .values({
            id: newId(),
            user_id: id,
            version: input.termsVersion,
            accepted_at: at(input.termsAcceptedAt ?? now),
          })
          .execute();
      return id;
    },

    async notifyAwaitingApproval(userId, email, at) {
      await notify(
        db,
        dialect,
        {
          recipients: await activeRoots(db),
          kind: "user.awaiting_approval",
          actorId: userId,
          subject: { type: "user", id: userId },
          params: { email },
        },
        at,
      );
    },

    async recordAudit(event, now) {
      await recordAudit(db, dialect, event, now);
    },
  };
  return repo;
};
