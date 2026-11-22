import { logger } from "../../../log";
import { renderMail } from "../../mail/services/templates";
import { ApprovalAnsweredError } from "../exceptions/errors";
import { isLocale, type Locale } from "../models/locale";
import { requirePermission } from "../models/permissions";
import type { CurrentUser } from "../models/user";
import type { ApprovalRepository, WaitingAccount } from "../repositories/approval-repository";

/**
 * Approval of self-registered accounts (190): with root's setting on, a new account waits until
 * a root approves it (it can sign in) or declines it (it's deleted, as it holds nothing yet). An
 * account left waiting for 30 days is declined by the retention job. Each answer is emailed.
 */

/** The longest an account waits: then the retention job declines it. */
export const APPROVAL_WAIT_DAYS = 30;

export type ApprovalDeps = {
  repo: ApprovalRepository;
  /** What the emails say: the instance's host and contact, read before any transaction. */
  mail: () => Promise<{ host: string; contact: string }>;
  now?: () => Date;
};

const log = logger.child({ domain: "identity" });

const clock = (deps: ApprovalDeps) => (deps.now ?? (() => new Date()))();

/** Who answers: a root, or the retention job after 30 days. */
export type Answerer = { user: CurrentUser; ip: string | null } | { job: "retention" };

const answer = async (
  deps: ApprovalDeps,
  who: Answerer,
  userId: string,
  decision: "approved" | "declined",
): Promise<void> => {
  if ("user" in who) requirePermission(who.user, "users.manage");
  const at = clock(deps);
  const sender = await deps.mail();
  await deps.repo.transaction(async (repo) => {
    const found = await repo.lockAccount(userId);
    // Another root answered first (or the job did): say so, and change nothing.
    if (found.state !== "waiting")
      throw new ApprovalAnsweredError(found.state === "approved" ? "approved" : "declined");
    const account: WaitingAccount = found.account;
    const locale: Locale = isLocale(account.locale) ? account.locale : "en";
    const template = decision === "approved" ? "sign_up_approved" : "sign_up_declined";
    const words = await renderMail(template, locale, {
      ...sender,
      at,
      ...(account.provider ? { provider: account.provider } : {}),
    });
    if (decision === "approved") await repo.approve(account.id, at);
    else await repo.deleteWaiting(account.id);
    await repo.queueMail(
      {
        template,
        locale,
        to: account.email,
        // Declined, the account is gone: the email outlives it, tied to nobody.
        userId: decision === "approved" ? account.id : null,
        ...words,
      },
      at,
    );
    await repo.recordAudit(
      {
        actorId: "user" in who ? who.user.id : null,
        action: decision === "approved" ? "user.approved" : "user.declined",
        target: { type: "user", id: account.id },
        metadata: {
          email: account.email,
          ...(decision === "declined" ? { by: "user" in who ? "root" : "retention" } : {}),
        },
        ipAddress: "user" in who ? who.ip : null,
      },
      at,
    );
  });
};

/** **Approve**: the account can sign in, and its owner is told. */
export const approveAccount = (deps: ApprovalDeps, who: Answerer, userId: string) =>
  answer(deps, who, userId, "approved");

/** **Decline**: the account is deleted, and its owner is told. */
export const declineAccount = (deps: ApprovalDeps, who: Answerer, userId: string) =>
  answer(deps, who, userId, "declined");

/** At most this many accounts are declined in one run; the rest wait for the next. */
const DECLINE_BATCH = 1000;

/**
 * The retention job's part (190): every account waiting more than 30 days is declined, with the
 * same email. Returns how many. One whose answer came meanwhile is skipped; one that can't be
 * declined is logged and skipped, so it never stops the others, and the next run tries it again.
 */
export const declineExpiredAccounts = async (deps: ApprovalDeps): Promise<number> => {
  const cutoff = new Date(clock(deps).getTime() - APPROVAL_WAIT_DAYS * 24 * 60 * 60_000);
  let declined = 0;
  for (const id of await deps.repo.waitingSince(cutoff, DECLINE_BATCH)) {
    try {
      await declineAccount(deps, { job: "retention" }, id);
      declined++;
    } catch (error) {
      if (error instanceof ApprovalAnsweredError) continue;
      log.error("A sign-up waiting 30 days couldn't be declined", { userId: id, err: error });
    }
  }
  return declined;
};
