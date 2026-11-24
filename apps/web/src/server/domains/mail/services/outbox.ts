import type { Db } from "../../../db/create-db";
import { newId } from "../../../db/ids";
import type { DatabaseDialect } from "../../../db/url";
import { logger } from "../../../log";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { isMailTransportKind, type MailLastStatus } from "../models/mail-settings";
import {
  isMailAddress,
  type MailFailureReason,
  type MailTransport,
  type SendResult,
} from "../models/message";
import {
  CLAIM_MS,
  MAX_ATTEMPTS,
  OUTBOX_BATCH,
  type OutboxBody,
  openBody,
  PER_ADDRESS_PER_HOUR,
  recipientHmac,
  retryDelayMs,
  sealBody,
} from "../models/outbox";
import {
  kyselyOutboxRepository,
  type OutboxUpdate,
} from "../repositories/kysely-outbox-repository";
import { type MailSetupContext, mailSender, recordMailStatus, storedMailSetup } from "./mail-setup";

const log = logger.child({ domain: "mail" });

const HOUR = 60 * 60_000;
const DAY_S = 24 * 60 * 60;

/** One message to queue: rendered already, in the person's language. */
export type QueuedMail = {
  /** Which email it is (a template's name), for the log, the data download and the purge. */
  template: string;
  locale: string;
  to: string;
  /** The account it's about, when there is one: erase and the data download find it by this. */
  userId: string | null;
  subject: string;
  text: string;
  html: string;
  /** A code's email: dropped past this, never sent late. */
  expiresAt?: Date;
};

export type QueueResult =
  | { queued: true; id: string }
  | { queued: false; reason: "not_set_up" | "cap" | "invalid" };

/**
 * Queues one email in the caller's transaction (189): `db` is that transaction, so the message
 * exists if and only if the change that causes it commits. Nothing is queued while email isn't
 * set up, and at most 10 an hour go to one address, every template together: the rest are dropped
 * and logged. The cap is counted, not locked: it holds against a flood, and messages queued in
 * the same instant can pass it by as many as race (locking in the caller's transaction could
 * deadlock and undo the caller's own change). The body is sealed to the row; only the address's
 * keyed hash is kept in clear.
 */
export const queueMail = async (
  db: Db,
  dialect: DatabaseDialect,
  authSecret: string,
  mail: QueuedMail,
  now: Date,
): Promise<QueueResult> => {
  if (!isMailAddress(mail.to)) return { queued: false, reason: "invalid" };
  const setup = await storedMailSetup(kyselySettingsRepository(db, dialect));
  if (!isMailTransportKind(setup.transport)) return { queued: false, reason: "not_set_up" };
  const repo = kyselyOutboxRepository(db, dialect);
  const hmac = recipientHmac(authSecret, mail.to);
  if ((await repo.countSince(hmac, new Date(now.getTime() - HOUR))) >= PER_ADDRESS_PER_HOUR) {
    log.event("mail.dropped", { template: mail.template, reason: "cap" });
    return { queued: false, reason: "cap" };
  }
  const id = newId();
  const body: OutboxBody = { to: mail.to, subject: mail.subject, text: mail.text, html: mail.html };
  await repo.insert({
    id,
    template: mail.template,
    locale: mail.locale,
    recipientHmac: hmac,
    userId: mail.userId,
    bodyEnc: sealBody(authSecret, id, body),
    nextAttemptAt: now,
    expiresAt: mail.expiresAt ?? null,
    createdAt: now,
  });
  return { queued: true, id };
};

export type DeliverDeps = { db: Db; dialect: DatabaseDialect; now?: () => Date };

/** What a run did, by end. */
export type DeliverCounts = { sent: number; retried: number; failed: number; dropped: number };

/**
 * Sends the rows due now, or only `ids` (the rows a request just queued). Each row is claimed with
 * a conditional update before it's touched, so two runs never send one row at once; each is sent
 * through the setup as it is now. Delivery is at least once: a run that dies after the provider
 * took the message but before it marked the row leaves it to be sent again once the claim runs
 * out (Resend's idempotency key drops the repeat).
 */
export const deliverDue = async (
  deps: DeliverDeps,
  context: MailSetupContext & { ca?: string },
  options: {
    ids?: readonly string[];
    limit?: number;
    renew?: () => Promise<void>;
    /** Sends in place of the transport the setup builds: for tests. */
    send?: MailTransport["send"];
  } = {},
): Promise<DeliverCounts> => {
  const now = () => (deps.now ?? (() => new Date()))();
  const repo = kyselyOutboxRepository(deps.db, deps.dialect);
  const settings = kyselySettingsRepository(deps.db, deps.dialect);
  const counts: DeliverCounts = { sent: 0, retried: 0, failed: 0, dropped: 0 };
  const ids = options.ids ?? (await repo.dueIds(now(), options.limit ?? OUTBOX_BATCH));
  for (const id of ids) {
    const claimId = newId();
    const at = now();
    if (!(await repo.claim(id, at, claimId, new Date(at.getTime() + CLAIM_MS)))) continue;
    const row = await repo.get(id);
    if (!row) continue;
    // Counted by the claim: this try's number.
    const attempts = row.attempts;
    const end = async (update: OutboxUpdate, reason: string, transport?: string) => {
      // A claim that ran out and was taken again: the other run ends the row, not this one.
      if (!(await repo.finish(id, claimId, update))) return false;
      const fields = { outboxId: id, template: row.template, ...(transport ? { transport } : {}) };
      if (update.status === "sent") {
        counts.sent++;
        log.event("mail.sent", fields);
      } else if (update.status === "queued") {
        counts.retried++;
        log.event("mail.retry", { ...fields, reason });
      } else if (update.status === "failed") {
        counts.failed++;
        log.event("mail.failed", { ...fields, reason });
      } else {
        counts.dropped++;
        log.event("mail.dropped", { ...fields, reason });
      }
      return true;
    };
    /** The setup's last status, written only by the run that ended the row. */
    const status = async (ended: boolean, next: MailLastStatus) => {
      if (ended) await recordMailStatus(settings, next, new Date(next.at));
    };
    if (row.expiresAt && row.expiresAt.getTime() <= at.getTime()) {
      await end({ status: "dropped", attempts, lastError: "expired" }, "expired");
      continue;
    }
    if (attempts > MAX_ATTEMPTS) {
      // Every try so far was cut off before it ended (the row was claimed again each time).
      await end({ status: "failed", attempts, lastError: "interrupted" }, "interrupted");
      continue;
    }
    const body =
      row.bodyEnc && context.authSecret ? openBody(context.authSecret, id, row.bodyEnc) : null;
    if (!body) {
      await end({ status: "dropped", attempts, lastError: "unreadable" }, "unreadable");
      continue;
    }
    const sender = await mailSender(settings, context);
    if (!sender.ok) {
      if (sender.problem === "not_set_up") {
        await end({ status: "dropped", attempts, lastError: "not_set_up" }, "not_set_up");
      } else {
        // The credentials can't be opened: kept, as root may replace them; the status says so.
        await status(await end(retryOrFail(attempts, at, "credentials"), "credentials"), {
          status: "failing",
          at: at.toISOString(),
          reason: "credentials",
        });
      }
      continue;
    }
    let result: SendResult;
    try {
      result = await (options.send ?? sender.transport.send)({
        to: body.to,
        from: sender.from,
        replyTo: sender.replyTo,
        subject: body.subject,
        text: body.text,
        html: body.html,
        idempotencyKey: id,
      });
    } catch {
      // A message that can't be composed (a mistake in Ronne): it won't go, whatever the wait.
      result = { status: "failed", reason: "rejected" };
    }
    const kind = sender.transport.kind;
    const done = now();
    if (result.status === "sent") {
      await status(await end({ status: "sent", at: done }, "sent", kind), {
        status: "working",
        at: done.toISOString(),
        setup: sender.setup,
      });
    } else if (result.status === "retry") {
      const update = retryOrFail(attempts, done, result.reason, result.waitSeconds);
      const ended = await end(update, result.reason, kind);
      // A retry says nothing yet about the setup; the last try failing does.
      if (update.status === "failed")
        await status(ended, {
          status: "failing",
          at: done.toISOString(),
          reason: result.reason,
          setup: sender.setup,
        });
    } else {
      await status(
        await end({ status: "failed", attempts, lastError: result.reason }, result.reason, kind),
        {
          status: "failing",
          at: done.toISOString(),
          reason: result.reason,
          setup: sender.setup,
        },
      );
    }
    await options.renew?.();
  }
  return counts;
};

/** Another try later, on the schedule or after the wait the provider asked for; or, past 8, failed. */
const retryOrFail = (
  attempts: number,
  at: Date,
  reason: MailFailureReason | "credentials",
  waitSeconds?: number,
): OutboxUpdate => {
  if (attempts >= MAX_ATTEMPTS) return { status: "failed", attempts, lastError: reason };
  // A provider's wait counts up to a day: a larger one (or nonsense) can't push the row past
  // what a date holds.
  const asked = Number.isFinite(waitSeconds) ? Math.min(Math.max(waitSeconds ?? 0, 0), DAY_S) : 0;
  const wait = Math.max(retryDelayMs(attempts), asked * 1000);
  return {
    status: "queued",
    attempts,
    nextAttemptAt: new Date(at.getTime() + wait),
    lastError: reason,
  };
};

/**
 * Drops every message not yet sent, its body deleted (189's Stop sending). The caller runs it in
 * the transaction that clears the transport.
 */
export const dropWaitingMail = (db: Db, dialect: DatabaseDialect): Promise<number> =>
  kyselyOutboxRepository(db, dialect).dropWaiting();
