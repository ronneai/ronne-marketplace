import { newId } from "../../../db/ids";
import { retryOnDeadlock } from "../../../db/locks";
import type { RateLimitStore } from "../../../rate-limit/rate-limiter";
import type { QueuedMail } from "../../mail/services/outbox";
import { type ResetMail, renderMail } from "../../mail/services/templates";
import { emailHmac, reserveEmailCodeSend } from "../models/email-code";
import { isLocale, type Locale } from "../models/locale";
import {
  newResetToken,
  RESET_PURPOSE,
  RESET_REQUEST_IP_LIMIT,
  type ResetEmail,
  resetEmailFor,
} from "../models/password-reset";
import { checkChallengeAnswer, checkForm, parseChallengeAnswer } from "../models/sign-up-guard";
import type { PasswordResetRepository } from "../repositories/password-reset-repository";
import { signUpEmail } from "./sign-up";

/**
 * Forgot password by email (194). A person types an address and always lands on the same code
 * page with the same words; what is emailed is decided here and never shown. Every request does
 * the same work, found or not: it looks the address up, takes the per-address limit (an HMAC of
 * the address), writes a flow row and queues or rehearses one email, so the answer and the time
 * can't tell an account exists. Sending is the outbox's (189), never on the request's path.
 */

/** What the reset reads of the instance, each time. */
export type ResetOpenness = {
  /** The setting on, email set up and the instance contact set. */
  open: boolean;
  /** 190's code lifetime, shared by every email code. */
  codeMinutes: number;
  /** 190's proof-of-work challenge, on the request page too. */
  challenge: boolean;
};

export type PasswordResetDeps = {
  repo: PasswordResetRepository;
  /** 109's database-backed limits. */
  limits: RateLimitStore;
  authSecret: string;
  /** Read at every step, so a change by root counts at once. */
  openness: () => Promise<ResetOpenness>;
  /** What the emails say: the instance's host and contact, and the root reset command. */
  mail: () => Promise<{ host: string; contact: string; command: string }>;
  now?: () => Date;
  /**
   * The least time a request's answer takes, in milliseconds (`RESET_ANSWER_MS` by default): a
   * real account's request writes more (its code, its email, its audit row), so every answer waits
   * until this long after the request began, and the time can't tell an account exists.
   */
  minimumMs?: number;
  /** Waits; tests pass their own. */
  wait?: (ms: number) => Promise<void>;
};

/** Every answer to a reset request waits until this long after it began (SPEC "Same time"). */
export const RESET_ANSWER_MS = 400;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const clock = (deps: PasswordResetDeps) => (deps.now ?? (() => new Date()))();

export type ResetRequest = {
  email: unknown;
  /** The page's language: the email's too. */
  locale: unknown;
  stamp: unknown;
  honeypot: unknown;
  challenge: unknown;
  /** The client's IP, only with `TRUST_PROXY=true`. */
  ip: string | null;
};

export type ResetRequested =
  /** The code page, whatever the address. `token` goes in the flow's cookie. */
  | { ok: true; token: string; expiresAt: Date }
  | { ok: false; refusal: "closed" | "stale" | "challenge" | "limited" | "invalid_email" };

const TEMPLATE: Record<Exclude<ResetEmail, "none">, ResetMail> = {
  code: "reset_code",
  root: "reset_root",
  providers: "reset_providers",
};

/**
 * Someone asks to reset a forgotten password (194). Refused before any lookup only for what says
 * nothing about the address: reset off, the per-IP limit, a stale form, the challenge, a typed
 * value that isn't an address. From the lookup on, every address gets the same answer.
 */
export const requestPasswordReset = async (
  deps: PasswordResetDeps,
  input: ResetRequest,
): Promise<ResetRequested> => {
  const started = performance.now();
  try {
    return await answer(deps, input);
  } finally {
    // Every answer, refusals included, at the same moment after the request began.
    const left = (deps.minimumMs ?? RESET_ANSWER_MS) - (performance.now() - started);
    if (left > 0) await (deps.wait ?? sleep)(left);
  }
};

const answer = async (deps: PasswordResetDeps, input: ResetRequest): Promise<ResetRequested> => {
  const at = clock(deps);
  const policy = await deps.openness();
  if (!policy.open) return { ok: false, refusal: "closed" };

  // The per-IP limit first, so a flood from one address is refused before anything else; nothing
  // is recorded for it, or a flood would fill the audit log.
  if (input.ip) {
    const decision = await deps.limits.consume(
      [{ limit: RESET_REQUEST_IP_LIMIT, key: input.ip }],
      at.getTime(),
    );
    if (!decision.allowed) return { ok: false, refusal: "limited" };
  }

  // A bot goes on as a person would, to the same code page, and gets nothing.
  const form = checkForm(deps.authSecret, { stamp: input.stamp, honeypot: input.honeypot }, at);
  if (form === "stale") return { ok: false, refusal: "stale" };
  const bot = form === "bot";
  if (policy.challenge) {
    const answer = parseChallengeAnswer(input.challenge);
    const check = answer ? checkChallengeAnswer(deps.authSecret, answer, at) : null;
    if (
      check?.result !== "ok" ||
      !(await deps.repo.takeChallenge(check.challengeHmac, check.expiresAt))
    )
      return { ok: false, refusal: "challenge" };
  }
  const email = signUpEmail(typeof input.email === "string" ? input.email.slice(0, 1024) : "");
  if (!email) return { ok: false, refusal: "invalid_email" };

  const locale: Locale = isLocale(input.locale) ? input.locale : "en";
  const sender = await deps.mail();
  const flowId = newId();
  const { token, hash } = newResetToken();
  // The per-address limit on every path (an HMAC of the address): 3 emails an hour, shared by
  // every replica. Over it, the page is the same and nothing goes.
  // The 60-second wait is the address's, not the flow's: each request makes a new flow.
  const send = await reserveEmailCodeSend(
    deps.limits,
    deps.authSecret,
    { purpose: RESET_PURPOSE, subjectId: `address:${emailHmac(deps.authSecret, email)}`, email },
    at,
  );
  const lifetime = new Date(at.getTime() + policy.codeMinutes * 60_000);
  // Requests at once hold the account's row in turn; a deadlock the database still picks is
  // tried again.
  const expiresAt = await retryOnDeadlock(() =>
    deps.repo.transaction(async (repo): Promise<Date> => {
      const account = await repo.findAccount(email);
      let kind = resetEmailFor(account, email, await repo.passwordPolicy());
      let providers = account?.providers ?? [];
      if (kind === "providers" && providers.length === 0)
        providers = await repo.enabledProviderNames();
      // No way to sign in to name: nothing to say.
      if (kind === "providers" && providers.length === 0) kind = "none";
      const gets = !bot && send.ok && kind !== "none";
      let code = "";
      let flowExpires = lifetime;
      let limited = !send.ok;
      if (gets && kind === "code" && account) {
        // A new request replaces the account's earlier codes. The account's row is held first, so
        // requests at once end each other's codes one after another, leaving one live code.
        await repo.lockAccount(account.id);
        await repo.endCodesOf(account.id, at);
        const issued = await repo.issueCode({
          purpose: RESET_PURPOSE,
          subjectId: flowId,
          email,
          minutes: policy.codeMinutes,
          now: at,
        });
        if (issued.ok) {
          code = issued.code;
          flowExpires = issued.expiresAt;
        } else limited = true;
      }
      // A code goes only when one was issued; the root's and the providers' answers need none.
      const sent = gets && (kind !== "code" || code !== "");
      await repo.insertFlow({
        id: flowId,
        tokenHash: hash,
        // Only an account that was sent a code can go on; the rest have a flow no code opens.
        userId: sent && kind === "code" ? (account?.id ?? null) : null,
        step: "code",
        expiresAt: flowExpires,
        createdAt: at,
      });
      const template = kind === "none" ? "reset_code" : TEMPLATE[kind];
      const words = await renderMail(template, locale, {
        host: sender.host,
        contact: sender.contact,
        at,
        // A placeholder for a request that sends nothing: rendered, then dropped.
        code: code || "000000",
        minutes: Math.round((flowExpires.getTime() - at.getTime()) / 60_000),
        command: sender.command,
        providers: providers.join(", ") || "-",
      });
      const mail: QueuedMail = {
        template,
        locale,
        to: account && account.email === email ? account.email : email,
        userId: account && account.email === email ? account.id : null,
        expiresAt: flowExpires,
        ...words,
      };
      if (sent) await repo.queueMail(mail, at);
      else await repo.rehearseMail(mail, at);
      // Only a real account leaves a trace: an unknown address can't fill the audit log.
      if (account && account.email === email && !account.erased)
        await repo.recordAudit(
          {
            actorId: null,
            action: "auth.password_reset_requested",
            target: { type: "user", id: account.id },
            metadata: {
              sent: sent
                ? kind
                : kind === "none"
                  ? "none"
                  : bot
                    ? "bot"
                    : limited
                      ? "limited"
                      : "none",
            },
            ipAddress: input.ip,
          },
          at,
        );
      return flowExpires;
    }),
  );
  return { ok: true, token, expiresAt };
};
