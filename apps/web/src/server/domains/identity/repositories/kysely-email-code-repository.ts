import type { Db } from "../../../db/create-db";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import type { DatabaseDialect } from "../../../db/url";
import {
  checkEmailCode,
  codeHmac,
  EMAIL_CODE_MAX_ATTEMPTS,
  type EmailCodeCheck,
  type EmailCodePurpose,
  type EmailCodeSend,
  emailCodeMinutes,
  emailCodeSendable,
  emailHmac,
  newEmailCode,
} from "../models/email-code";

const HOUR_MS = 60 * 60_000;

export type IssuedEmailCode = { ok: true; id: string; code: string; expiresAt: Date };

/**
 * One-time codes by email (190; 194 and 197 too). Every method works on the `db` it's given, so a
 * caller runs `issue` in the transaction that queues the email: the code exists if and only if
 * its email does. Before that transaction, the caller counts the send with `reserveEmailCodeSend`
 * (models/email-code.ts): that's what holds the limits when sends race; `issue`'s own check holds
 * them to the second for sends that come one after another.
 */
export const kyselyEmailCodeRepository = (db: Db, dialect: DatabaseDialect, authSecret: string) => {
  const at = (date: Date) => toDbDate(date, dialect);
  return {
    /**
     * A new code for this purpose and subject, sent to `email`, if one may go now (60 seconds
     * after the last for the subject, 3 an hour to the address). It ends the subject's earlier
     * codes for the purpose. The code itself is returned once, for the email, and never stored.
     */
    async issue(input: {
      purpose: EmailCodePurpose;
      subjectId: string;
      email: string;
      minutes: number;
      now: Date;
    }): Promise<IssuedEmailCode | Exclude<EmailCodeSend, { ok: true }>> {
      const { purpose, subjectId, now } = input;
      const addressHmac = emailHmac(authSecret, input.email);
      const last = await db
        .selectFrom("email_codes")
        .select("created_at")
        .where("purpose", "=", purpose)
        .where("subject_id", "=", subjectId)
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst();
      const forAddress = await db
        .selectFrom("email_codes")
        .select("created_at")
        .where("purpose", "=", purpose)
        .where("email_hmac", "=", addressHmac)
        .where("created_at", ">", at(new Date(now.getTime() - HOUR_MS)))
        .execute();
      const sendable = emailCodeSendable(
        {
          lastForSubject: last ? fromDbDate(last.created_at) : null,
          forAddressLastHour: forAddress.map((r) => fromDbDate(r.created_at)),
        },
        now,
      );
      if (!sendable.ok) return sendable;
      // Asking for a new code ends the one before: only the latest works.
      await db
        .updateTable("email_codes")
        .set({ consumed_at: at(now) })
        .where("purpose", "=", purpose)
        .where("subject_id", "=", subjectId)
        .where("consumed_at", "is", null)
        .execute();
      const code = newEmailCode();
      const id = newId();
      // Held to 5–60 minutes whatever the caller passed.
      const expiresAt = new Date(now.getTime() + emailCodeMinutes(input.minutes) * 60_000);
      await db
        .insertInto("email_codes")
        .values({
          id,
          purpose,
          subject_id: subjectId,
          email_hmac: addressHmac,
          code_hmac: codeHmac(authSecret, purpose, subjectId, code),
          attempts: 0,
          created_at: at(now),
          expires_at: at(expiresAt),
          consumed_at: null,
        })
        .execute();
      return { ok: true, id, code, expiresAt };
    },

    /**
     * Checks a typed code against the subject's latest one. Right: it's used, once, by a
     * conditional update, so two right answers at once give one success. Wrong: one try is
     * spent, by a conditional update too, so racing guesses can't get past the five.
     */
    async verify(input: {
      purpose: EmailCodePurpose;
      subjectId: string;
      typed: string;
      now: Date;
    }): Promise<EmailCodeCheck | { result: "none" }> {
      const { purpose, subjectId, now } = input;
      const row = await db
        .selectFrom("email_codes")
        .selectAll()
        .where("purpose", "=", purpose)
        .where("subject_id", "=", subjectId)
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(1)
        .executeTakeFirst();
      if (!row) return { result: "none" };
      const stored = {
        purpose,
        subjectId,
        codeHmac: row.code_hmac,
        attempts: Number(row.attempts),
        expiresAt: fromDbDate(row.expires_at),
        consumedAt: row.consumed_at ? fromDbDate(row.consumed_at) : null,
      };
      const check = checkEmailCode(authSecret, stored, input.typed, now);
      if (check.result === "ok") {
        const used = await db
          .updateTable("email_codes")
          .set({ consumed_at: at(now) })
          .where("id", "=", row.id)
          .where("consumed_at", "is", null)
          .where("attempts", "<", EMAIL_CODE_MAX_ATTEMPTS)
          .executeTakeFirst();
        return Number(used.numUpdatedRows) === 1 ? check : { result: "used" };
      }
      if (check.result === "wrong") {
        const spent = await db
          .updateTable("email_codes")
          .set((eb) => ({ attempts: eb("attempts", "+", 1) }))
          .where("id", "=", row.id)
          .where("consumed_at", "is", null)
          .where("attempts", "<", EMAIL_CODE_MAX_ATTEMPTS)
          .executeTakeFirst();
        if (Number(spent.numUpdatedRows) !== 1) return { result: "spent" };
      }
      return check;
    },
  };
};

export type EmailCodeRepository = ReturnType<typeof kyselyEmailCodeRepository>;
