import type { Db } from "../../../db/create-db";
import { fromDbDate, toDbDate } from "../../../db/dates";
import type { DatabaseDialect } from "../../../db/url";
import type { OutboxStatus } from "../models/outbox";

/** One row as the outbox reads it. */
export type OutboxRow = {
  id: string;
  template: string;
  locale: string;
  recipientHmac: string;
  userId: string | null;
  bodyEnc: string | null;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  expiresAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

export type NewOutboxRow = {
  id: string;
  template: string;
  locale: string;
  recipientHmac: string;
  userId: string | null;
  bodyEnc: string;
  nextAttemptAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
};

/** How a claimed row ends this try. */
export type OutboxUpdate =
  | { status: "sent"; at: Date }
  | { status: "queued"; attempts: number; nextAttemptAt: Date; lastError: string }
  | { status: "failed" | "dropped"; attempts: number; lastError: string };

/**
 * The outbox's storage (189). Every method works on the `db` it's given, so `insert` runs in the
 * caller's transaction and a rolled-back change queues nothing.
 */
export const kyselyOutboxRepository = (db: Db, dialect: DatabaseDialect) => {
  const at = (date: Date) => toDbDate(date, dialect);
  return {
    async insert(row: NewOutboxRow): Promise<void> {
      await db
        .insertInto("mail_outbox")
        .values({
          id: row.id,
          template: row.template,
          locale: row.locale,
          recipient_hmac: row.recipientHmac,
          user_id: row.userId,
          body_enc: row.bodyEnc,
          status: "queued",
          attempts: 0,
          next_attempt_at: at(row.nextAttemptAt),
          claim_expires_at: null,
          claim_id: null,
          expires_at: row.expiresAt ? at(row.expiresAt) : null,
          last_error: null,
          created_at: at(row.createdAt),
          sent_at: null,
        })
        .execute();
    },

    /** Messages queued for one address after `since`, whatever became of them. */
    async countSince(recipientHmac: string, since: Date): Promise<number> {
      const row = await db
        .selectFrom("mail_outbox")
        .select((eb) => eb.fn.countAll().as("n"))
        .where("recipient_hmac", "=", recipientHmac)
        // Strictly after: a row queued exactly an hour ago has left the hour.
        .where("created_at", ">", at(since))
        .executeTakeFirst();
      return Number(row?.n ?? 0);
    },

    /** Root's test emails since `since` (189's 5 in 10 minutes), whatever became of them. */
    async countTests(userId: string, since: Date): Promise<number> {
      const row = await db
        .selectFrom("mail_outbox")
        .select((eb) => eb.fn.countAll().as("n"))
        .where("template", "=", "test")
        .where("user_id", "=", userId)
        .where("created_at", ">", at(since))
        .executeTakeFirst();
      return Number(row?.n ?? 0);
    },

    /** A test email, sent at once rather than queued: its row, already ended and without a body. */
    async recordTest(row: {
      id: string;
      locale: string;
      recipientHmac: string;
      userId: string;
      status: "sent" | "failed";
      lastError: string | null;
      at: Date;
    }): Promise<void> {
      await db
        .insertInto("mail_outbox")
        .values({
          id: row.id,
          template: "test",
          locale: row.locale,
          recipient_hmac: row.recipientHmac,
          user_id: row.userId,
          body_enc: null,
          status: row.status,
          attempts: 1,
          next_attempt_at: at(row.at),
          claim_expires_at: null,
          claim_id: null,
          expires_at: null,
          last_error: row.lastError,
          created_at: at(row.at),
          sent_at: row.status === "sent" ? at(row.at) : null,
        })
        .execute();
    },

    /** Rows due now: queued and their time come, or a claim that ran out. Oldest first. */
    async dueIds(now: Date, limit: number): Promise<string[]> {
      const rows = await db
        .selectFrom("mail_outbox")
        .select("id")
        .where((eb) =>
          eb.or([
            eb.and([eb("status", "=", "queued"), eb("next_attempt_at", "<=", at(now))]),
            eb.and([eb("status", "=", "sending"), eb("claim_expires_at", "<", at(now))]),
          ]),
        )
        .orderBy("next_attempt_at")
        .orderBy("id")
        .limit(limit)
        .execute();
      return rows.map((r) => r.id);
    },

    /**
     * Takes one row for this try, if it's still due: one conditional update, so two processes or
     * replicas never hold the same row. `claimId` marks the claim; only its holder finishes it.
     */
    async claim(id: string, now: Date, claimId: string, until: Date): Promise<boolean> {
      // The try is counted as it starts, so one that never finishes (a process that dies, a send
      // that hangs) still counts toward the 8, and a row that always crashes ends.
      const result = await db
        .updateTable("mail_outbox")
        .set((eb) => ({
          status: "sending",
          claim_id: claimId,
          claim_expires_at: at(until),
          attempts: eb("attempts", "+", 1),
        }))
        .where("id", "=", id)
        .where((eb) =>
          eb.or([
            eb.and([eb("status", "=", "queued"), eb("next_attempt_at", "<=", at(now))]),
            eb.and([eb("status", "=", "sending"), eb("claim_expires_at", "<", at(now))]),
          ]),
        )
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 1;
    },

    async get(id: string): Promise<OutboxRow | null> {
      const row = await db
        .selectFrom("mail_outbox")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
      if (!row) return null;
      return {
        id: row.id,
        template: row.template,
        locale: row.locale,
        recipientHmac: row.recipient_hmac,
        userId: row.user_id,
        bodyEnc: row.body_enc,
        status: row.status as OutboxStatus,
        attempts: Number(row.attempts),
        nextAttemptAt: fromDbDate(row.next_attempt_at),
        expiresAt: fromDbDate(row.expires_at),
        lastError: row.last_error,
        createdAt: fromDbDate(row.created_at),
        sentAt: fromDbDate(row.sent_at),
      };
    },

    /**
     * Ends this try, if the claim is still this one's. Every end but a retry deletes the body:
     * a sent, failed or dropped message keeps no address, subject or text.
     */
    async finish(id: string, claimId: string, update: OutboxUpdate): Promise<boolean> {
      const set =
        update.status === "sent"
          ? { status: "sent", body_enc: null, sent_at: at(update.at), last_error: null }
          : update.status === "queued"
            ? {
                status: "queued",
                attempts: update.attempts,
                next_attempt_at: at(update.nextAttemptAt),
                last_error: update.lastError,
              }
            : {
                status: update.status,
                body_enc: null,
                attempts: update.attempts,
                last_error: update.lastError,
              };
      const result = await db
        .updateTable("mail_outbox")
        .set({ ...set, claim_id: null, claim_expires_at: null })
        .where("id", "=", id)
        .where("claim_id", "=", claimId)
        .where("status", "=", "sending")
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 1;
    },

    /** Drops every message not yet sent, its body deleted: when root stops sending. */
    async dropWaiting(): Promise<number> {
      const result = await db
        .updateTable("mail_outbox")
        .set({
          status: "dropped",
          body_enc: null,
          last_error: "stopped",
          claim_id: null,
          claim_expires_at: null,
        })
        .where("status", "in", ["queued", "sending"])
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /** The bodies still sealed, for `rotate-secret`. */
    async sealedBodies(): Promise<{ id: string; bodyEnc: string }[]> {
      const rows = await db
        .selectFrom("mail_outbox")
        .select(["id", "body_enc"])
        .where("body_enc", "is not", null)
        .execute();
      return rows.map((r) => ({ id: r.id, bodyEnc: r.body_enc as string }));
    },

    /**
     * Drops a message whose body `rotate-secret` couldn't open (an older AUTH_SECRET), only over
     * the value read and only while it waits.
     */
    async dropUnreadable(id: string, from: string): Promise<boolean> {
      const result = await db
        .updateTable("mail_outbox")
        .set({
          status: "dropped",
          body_enc: null,
          last_error: "unreadable",
          claim_id: null,
          claim_expires_at: null,
        })
        .where("id", "=", id)
        .where("body_enc", "=", from)
        .where("status", "in", ["queued", "sending"])
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 1;
    },

    /** Writes a body re-sealed under the new secret, only over the value read. */
    async setBody(id: string, from: string, to: string): Promise<boolean> {
      const result = await db
        .updateTable("mail_outbox")
        .set({ body_enc: to })
        .where("id", "=", id)
        .where("body_enc", "=", from)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) === 1;
    },
  };
};

export type OutboxRepository = ReturnType<typeof kyselyOutboxRepository>;
