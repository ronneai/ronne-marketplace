import type { Db } from "../../../db/create-db";
import { newId } from "../../../db/ids";
import type { DatabaseDialect } from "../../../db/url";
import { requirePermission } from "../../identity/models/permissions";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import type { SettingsRepository } from "../../settings/repositories/settings-repository";
import { languagePolicy, type SettingsActor } from "../../settings/services/settings";
import {
  MailCredentialsUnreadableError,
  MailNotSetUpError,
  MailTestLimitError,
} from "../exceptions/errors";
import { MAIL_KEYS, parseLastStatus, setupFingerprint } from "../models/mail-settings";
import type { MailFailureReason, MailTransport, SendResult } from "../models/message";
import { recipientHmac } from "../models/outbox";
import { kyselyOutboxRepository } from "../repositories/kysely-outbox-repository";
import { type MailSetupContext, mailSender, recordMailStatus, storedMailSetup } from "./mail-setup";
import { dropWaitingMail } from "./outbox";
import { mailLocale, renderMail } from "./templates";

/** At most this many test emails per root in `TEST_WINDOW_MS`. */
export const TESTS_PER_WINDOW = 5;
export const TEST_WINDOW_MS = 10 * 60_000;

export type MailAdminDeps = { db: Db; dialect: DatabaseDialect; now?: () => Date };

/** What the instance's emails need beyond the setup: the public address, whose host names it. */
export type MailAdminContext = MailSetupContext & {
  publicUrl: string | undefined;
  ca?: string;
  /** Sends in place of the transport the setup builds: for tests. */
  send?: MailTransport["send"];
};

/** The test's result as the tab shows it: the reason by kind, and the server's cleaned answer. */
export type TestEmailResult =
  | { result: "sent" }
  | { result: "retry" | "failed"; reason: MailFailureReason; detail?: string };

/** The instance's host, from `PUBLIC_URL`; the server's own name for it when that isn't set. */
export const instanceHost = (publicUrl: string | undefined): string => {
  try {
    return publicUrl ? new URL(publicUrl).host : "localhost";
  } catch {
    return "localhost";
  }
};

/**
 * Root's test email (189): sent at once, not queued, to the signed-in root's own address, never
 * one typed in, so the tab can't mail strangers. At most 5 per root in 10 minutes, counted from
 * the outbox's rows: each test leaves one, without a body. The answer is the server's or API's,
 * cleaned of credentials by the transport. Audited as `mail.test_sent` with the result only.
 */
export const sendTestEmail = async (
  deps: MailAdminDeps,
  actor: SettingsActor,
  context: MailAdminContext,
): Promise<TestEmailResult> => {
  requirePermission(actor.user, "settings.manage");
  const user = actor.user;
  if (!user) throw new MailNotSetUpError();
  const now = (deps.now ?? (() => new Date()))();
  const settings = kyselySettingsRepository(deps.db, deps.dialect);
  const outbox = kyselyOutboxRepository(deps.db, deps.dialect);
  const sender = await mailSender(settings, context);
  if (!sender.ok) {
    if (sender.problem === "credentials_unreadable") throw new MailCredentialsUnreadableError();
    throw new MailNotSetUpError();
  }
  const since = new Date(now.getTime() - TEST_WINDOW_MS);
  if ((await outbox.countTests(user.id, since)) >= TESTS_PER_WINDOW)
    throw new MailTestLimitError(TESTS_PER_WINDOW);
  const locale = mailLocale(user.locale ?? null, await languagePolicy({ repo: settings }));
  const id = newId();
  const mail = await renderMail("test", locale, {
    host: instanceHost(context.publicUrl),
    contact: sender.contact,
    at: now,
  });
  let sent: SendResult;
  try {
    sent = await (context.send ?? sender.transport.send)({
      to: user.email,
      from: sender.from,
      replyTo: sender.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      idempotencyKey: id,
    });
  } catch {
    sent = { status: "failed", reason: "rejected" };
  }
  const done = (deps.now ?? (() => new Date()))();
  const result: TestEmailResult =
    sent.status === "sent"
      ? { result: "sent" }
      : {
          result: sent.status,
          reason: sent.reason,
          ...(sent.detail ? { detail: sent.detail } : {}),
        };
  await deps.db.transaction().execute(async (trx) => {
    await kyselyOutboxRepository(trx, deps.dialect).recordTest({
      id,
      locale,
      recipientHmac: recipientHmac(context.authSecret ?? "", user.email),
      userId: user.id,
      status: sent.status === "sent" ? "sent" : "failed",
      lastError: sent.status === "sent" ? null : sent.reason,
      at: done,
    });
    const repo = kyselySettingsRepository(trx, deps.dialect);
    await recordMailStatus(
      repo,
      sent.status === "sent"
        ? { status: "working", at: done.toISOString(), setup: sender.setup }
        : { status: "failing", at: done.toISOString(), reason: sent.reason, setup: sender.setup },
      done,
    );
    await repo.recordAudit(
      {
        actorId: user.id,
        action: "mail.test_sent",
        target: { type: "instance" },
        metadata: {
          result: result.result,
          ...(result.result === "sent" ? {} : { reason: result.reason }),
        },
        ipAddress: actor.ip,
      },
      done,
    );
  });
  return result;
};

/**
 * Stop sending (189): the transport is cleared, so nothing more is queued or sent, and every
 * message still waiting is dropped, its body deleted, in the same transaction. The rest of the
 * setup stays, for root to pick a transport again. Audited as `settings.mail`.
 */
export const stopSending = async (
  deps: MailAdminDeps,
  actor: SettingsActor,
): Promise<{ stopped: boolean; dropped: number }> => {
  requirePermission(actor.user, "settings.manage");
  const at = (deps.now ?? (() => new Date()))();
  return deps.db.transaction().execute(async (trx) => {
    const repo = kyselySettingsRepository(trx, deps.dialect);
    const from = await storedMailSetup(repo);
    if (!from.transport) return { stopped: false, dropped: 0 };
    const by = actor.user?.id ?? null;
    await repo.set(MAIL_KEYS.transport, "", by, at);
    await repo.set(MAIL_KEYS.lastStatus, "", by, at);
    const dropped = await dropWaitingMail(trx, deps.dialect);
    await repo.recordAudit(
      {
        actorId: by,
        action: "settings.mail",
        target: { type: "instance" },
        metadata: {
          setup: { from: { transport: from.transport }, to: { transport: null } },
          stopped: true,
          dropped,
        },
        ipAddress: actor.ip,
      },
      at,
    );
    return { stopped: true, dropped };
  });
};

/** What `mailReadiness` says, from one settings repository. */
const readinessFrom = async (
  repo: SettingsRepository,
): Promise<{ sending: boolean; working: boolean; contact: string }> => {
  const setup = await storedMailSetup(repo);
  // The last test or send (189): `working` only when it worked through the setup as it is now
  // (194); none yet, a failure, or a success through a setup root has since changed, isn't.
  const last = parseLastStatus((await repo.get(MAIL_KEYS.lastStatus))?.value);
  return {
    sending: setup.transport !== "",
    working:
      setup.transport !== "" &&
      last?.status === "working" &&
      last.setup === setupFingerprint(setup),
    contact: setup.contact,
  };
};

/**
 * Whether email can go out, whether its last test or send worked, and the instance contact (189):
 * what 190 and 194 check before their switches turn on. No permission check: it says only whether
 * a feature may use email.
 */
export const mailReadiness = async (
  db: Db,
  dialect: DatabaseDialect,
): Promise<{ sending: boolean; working: boolean; contact: string }> =>
  readinessFrom(kyselySettingsRepository(db, dialect));

/**
 * The same, read inside a caller's transaction (194's switch), holding the contact's row: it is
 * written again with the value just read, a compare-and-set, so an email save that changes the
 * contact at the same moment waits for the caller's transaction, or, having changed it first,
 * makes this read no contact. The row keeps its value, author and time.
 */
export const lockedMailReadiness = async (
  repo: SettingsRepository,
): Promise<{ sending: boolean; working: boolean; contact: string }> => {
  const ready = await readinessFrom(repo);
  if (ready.contact === "") return ready;
  const row = await repo.get(MAIL_KEYS.contact);
  const held =
    row !== null &&
    (await repo.compareAndSet(
      MAIL_KEYS.contact,
      row.value,
      row.value,
      row.updatedBy,
      row.updatedAt,
    ));
  return held ? ready : { ...ready, contact: "" };
};
