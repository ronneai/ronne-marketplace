import { newId } from "../../../db/ids";
import { retryOnDeadlock } from "../../../db/locks";
import type { RateLimitStore } from "../../../rate-limit/rate-limiter";
import type { QueuedMail } from "../../mail/services/outbox";
import { type ResetMail, renderMail } from "../../mail/services/templates";
import { InvalidPasswordError } from "../exceptions/errors";
import { emailHmac, reserveEmailCodeSend } from "../models/email-code";
import { isLocale, type Locale } from "../models/locale";
import { validatePassword } from "../models/password";
import type { PasswordHasher } from "../models/password-hasher";
import {
  newResetToken,
  RESET_CODE_IP_LIMIT,
  RESET_GRANT_MS,
  RESET_PAUSE_MS,
  RESET_PURPOSE,
  RESET_REQUEST_IP_LIMIT,
  type ResetEmail,
  type ResetStep,
  resetEmailFor,
  resetPaused,
  resetTokenHash,
} from "../models/password-reset";
import { checkChallengeAnswer, checkForm, parseChallengeAnswer } from "../models/sign-up-guard";
import type { PasswordResetRepository, ResetFlow } from "../repositories/password-reset-repository";
import type { TwoFactorStore } from "../repositories/two-factor-store";
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
  /** Hashes the new password as sign-in reads it (argon2id). */
  hasher: PasswordHasher;
  /** The account's two-factor (105), checked with no session at the reset's two-factor step. */
  twoFactor: Pick<TwoFactorStore, "enabled" | "checkCodeOf">;
};

/** How long after a reset commits its late session cleanup runs (a blocked insert lands first). */
export const RESET_SETTLE_MS = 100;

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
      // Every flow gets a code, emailed only when the table says so, so the code page behaves the
      // same for every address: five tries, the lifetime, replaced by a newer request. A newer
      // request ends the address's earlier codes; a real account's row is held first, so requests
      // at once for it end each other's codes one after another, leaving one live code.
      if (send.ok) {
        if (kind === "code" && account) await repo.lockAccount(account.id);
        await repo.endCodesFor(email, at);
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
      // Emailed only to whom the table names, once a code exists.
      const sent = gets && code !== "";
      await repo.insertFlow({
        id: flowId,
        tokenHash: hash,
        // Only an account that was sent a code can go on; the rest have a flow no code opens.
        userId: sent && kind === "code" ? (account?.id ?? null) : null,
        step: "code",
        expiresAt: flowExpires,
        twoFactorAt: null,
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

// ---- The code and two-factor steps (task 4) ------------------------------------------------------

/** Why a step is refused, as its page says it. */
export type StepRefusal =
  /** A wrong code: try again. */
  | "wrong"
  /** Five wrong codes, or the flow has ended: ask for a new code. */
  | "spent"
  /** The code ran out: send a new one. */
  | "expired"
  /** A newer request replaced this code: use the newest email. */
  | "replaced"
  /** No flow cookie in this browser: start again here. */
  | "missing"
  /** The account changed (disabled, made root, erased, Root only): this reset can't continue. */
  | "cannot_continue"
  /** A TOTP code already accepted. */
  | "used"
  /** Ten wrong two-factor codes in a row: locked for 15 minutes, as at sign-in. */
  | "locked"
  /** The account's two-factor can't be read on this server: a root resets it. */
  | "unreadable"
  | "limited";

export type StepChecked =
  /** The next page, and the cookie's new value (it changes at every step). */
  | { ok: true; token: string; step: Exclude<ResetStep, "code"> }
  | { ok: false; refusal: StepRefusal };

/** The flow a cookie names, at `step`, while it lasts; null otherwise. */
const flowAt = async (
  repo: PasswordResetRepository,
  token: string,
  step: ResetStep,
  at: Date,
): Promise<ResetFlow | null> => {
  const flow = await repo.flowByToken(resetTokenHash(token));
  if (!flow || flow.step !== step || flow.expiresAt <= at) return null;
  return flow;
};

/** The step after a right code or two-factor, read from the account as it is now. */
const nextStep = async (
  repo: PasswordResetRepository,
  flow: ResetFlow,
  at: Date,
  /** Whether the account has two-factor on, read before the transaction (SQLite has one connection). */
  twoFactorOn: boolean,
  twoFactorPassed: boolean,
): Promise<StepChecked> => {
  const step = twoFactorOn && !twoFactorPassed ? "two_factor" : "new_password";
  const { token, hash } = newResetToken();
  const moved = await repo.advanceFlow(flow.id, flow.tokenHash, {
    tokenHash: hash,
    step,
    // The new-password page works for 10 minutes from the moment the last step was passed; the
    // two-factor step keeps the flow's own end (its code's).
    expiresAt: step === "new_password" ? new Date(at.getTime() + RESET_GRANT_MS) : flow.expiresAt,
    ...(twoFactorPassed ? { twoFactorAt: at } : {}),
  });
  // Another submit moved it first: this cookie is the old one.
  if (!moved) return { ok: false, refusal: "spent" };
  return { ok: true, token, step };
};

/**
 * Whether the account may still reset by email: the "What is sent" table read again, now. A flow
 * whose account was disabled, erased, made root, or kept off passwords since ends.
 */
const stillResettable = async (repo: PasswordResetRepository, userId: string) => {
  const account = await repo.accountById(userId);
  return (
    account !== null &&
    resetEmailFor(account, account.email, await repo.passwordPolicy()) === "code"
  );
};

const typed = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * The code typed on the code page (194). The flow's cookie names the flow; its code follows 190's
 * rules (5 tries, the lifetime, used once, replaced by a newer request). Every flow has one, so
 * every address's code page answers alike, and in the same time (the request's floor). Right: the
 * next step is the account's two-factor when it has it on, else the new-password page, and the
 * cookie changes. Nothing here signs anyone in. 20 wrong codes for an account in 24 hours pause
 * reset by email for it: every code is then wrong, and sign-in itself is never locked.
 */
export const checkResetCode = async (
  deps: PasswordResetDeps,
  input: { token: string | null; code: unknown; ip: string | null },
): Promise<StepChecked> => {
  const started = performance.now();
  try {
    return await codeAnswer(deps, input);
  } finally {
    const left = (deps.minimumMs ?? RESET_ANSWER_MS) - (performance.now() - started);
    if (left > 0) await (deps.wait ?? sleep)(left);
  }
};

const codeAnswer = async (
  deps: PasswordResetDeps,
  input: { token: string | null; code: unknown; ip: string | null },
): Promise<StepChecked> => {
  const at = clock(deps);
  if (input.ip) {
    const decision = await deps.limits.consume(
      [{ limit: RESET_CODE_IP_LIMIT, key: input.ip }],
      at.getTime(),
    );
    if (!decision.allowed) return { ok: false, refusal: "limited" };
  }
  if (!input.token) return { ok: false, refusal: "missing" };
  const flow = await deps.repo.flowByToken(resetTokenHash(input.token));
  if (flow?.step !== "code") return { ok: false, refusal: "spent" };
  if (flow.expiresAt <= at) return { ok: false, refusal: "expired" };
  const code = typed(input.code, 32);
  // Read before the transaction: the store reads through the app's own connection.
  const twoFactorOn = flow.userId ? await deps.twoFactor.enabled(flow.userId) : false;
  return retryOnDeadlock(() =>
    deps.repo.transaction(async (repo): Promise<StepChecked> => {
      const userId = flow.userId;
      const failed = async (reason: string) => {
        if (userId)
          await repo.recordAudit(
            {
              actorId: null,
              action: "auth.password_reset_code_failed",
              target: { type: "user", id: userId },
              metadata: { reason },
              ipAddress: input.ip,
            },
            at,
          );
      };
      // Paused after 20 wrong codes in a day: a right code is wrong too, and nothing says why.
      // The account's row first: tries at once for one account are counted one after another, so
      // a burst at the threshold can't all read the count from before it.
      if (userId) await repo.lockAccount(userId);
      // Counted from the account's own audit record, so ended flows and a new address count too;
      // two days back, as 20 within a day keep it paused a day after the 20th.
      const paused =
        userId !== null &&
        resetPaused(
          await repo.wrongCodeTimes(userId, new Date(at.getTime() - 2 * RESET_PAUSE_MS)),
          at,
        );
      const check = await repo.verifyCode({
        purpose: RESET_PURPOSE,
        subjectId: flow.id,
        typed: paused ? "------" : code,
        now: at,
      });
      // No one can know the code of a flow without an account: right or not, it's wrong.
      if (check.result === "ok" && userId) {
        if (!(await stillResettable(repo, userId))) {
          await repo.endFlow(flow.id, at);
          await failed("cannot_continue");
          return { ok: false, refusal: "cannot_continue" };
        }
        return nextStep(repo, flow, at, twoFactorOn, false);
      }
      const result = check.result === "ok" ? "wrong" : check.result;
      await failed(paused && result === "wrong" ? "paused" : result);
      if (result === "expired") return { ok: false, refusal: "expired" };
      // Used: a newer request ended it (a right code is used once, and moves the flow on).
      if (result === "used") return { ok: false, refusal: "replaced" };
      if (result === "spent" || result === "none") {
        await repo.endFlow(flow.id, at);
        return { ok: false, refusal: "spent" };
      }
      return { ok: false, refusal: "wrong" };
    }),
  );
};

/**
 * The account's two-factor at a reset (194, Decision 2): a TOTP code or a backup code, checked as
 * at sign-in with no session. A TOTP code already accepted is refused; a backup code is used up;
 * wrong codes count with the sign-in's own, so ten in a row lock it for 15 minutes either way.
 * Turned off meanwhile, the step is passed as it no longer applies.
 */
export const checkResetTwoFactor = async (
  deps: PasswordResetDeps,
  input: { token: string | null; code: unknown; ip: string | null },
): Promise<StepChecked> => {
  const at = clock(deps);
  if (input.ip) {
    const decision = await deps.limits.consume(
      [{ limit: RESET_CODE_IP_LIMIT, key: input.ip }],
      at.getTime(),
    );
    if (!decision.allowed) return { ok: false, refusal: "limited" };
  }
  if (!input.token) return { ok: false, refusal: "missing" };
  const flow = await flowAt(deps.repo, input.token, "two_factor", at);
  if (!flow?.userId) return { ok: false, refusal: "spent" };
  const userId = flow.userId;
  const failed = (reason: string) =>
    deps.repo.recordAudit(
      {
        actorId: null,
        action: "auth.password_reset_two_factor_failed",
        target: { type: "user", id: userId },
        metadata: { reason },
        ipAddress: input.ip,
      },
      at,
    );
  if (!(await stillResettable(deps.repo, userId))) {
    await deps.repo.transaction((repo) => repo.endFlow(flow.id, at));
    await failed("cannot_continue");
    return { ok: false, refusal: "cannot_continue" };
  }
  if (!(await deps.twoFactor.enabled(userId)))
    return deps.repo.transaction((repo) => nextStep(repo, flow, at, false, false));
  // A TOTP code is 6 digits, spaces allowed; a backup code is kept as typed. Every refusal, an
  // empty or used code included, counts in the account's lockout, as the store checks them all.
  const raw = typed(input.code, 32);
  const code = /^[\d\s]+$/.test(raw) ? raw.replace(/\s+/g, "") : raw;
  const right = await deps.twoFactor.checkCodeOf(userId, code);
  if (right === "locked" || right === "unreadable" || right === "used") {
    await failed(right);
    return { ok: false, refusal: right };
  }
  if (!right) {
    await failed("wrong_code");
    return { ok: false, refusal: "wrong" };
  }
  return deps.repo.transaction((repo) => nextStep(repo, flow, at, true, true));
};

// ---- The reset (task 5) ---------------------------------------------------------------------------

export type ResetCompleted =
  /** The password is set; every session ended. The person signs in again with it. */
  | { ok: true; done: true }
  /** Two-factor was turned on since the flow passed its code: its step first, with a new cookie. */
  | { ok: true; done: false; step: "two_factor"; token: string }
  | {
      ok: false;
      refusal:
        | "missing"
        | "spent"
        | "expired"
        | "cannot_continue"
        | "mismatch"
        | "password_short"
        | "password_long";
    };

/**
 * The new-password page, posted (194). The grant lasts 10 minutes from the last step passed and is
 * used once, only from the browser holding the flow's current cookie. The account is read as it
 * is now: disabled, made root, erased or kept off passwords since, the reset can't continue; with
 * two-factor turned on since and never passed in this flow, it goes back to that step. The same
 * password as before is allowed (Decision 7). In one transaction: the password, 128's hold
 * cleared, every session ended, the account's other reset flows and codes and its approved
 * `rmk login --web` sign-ins ended, its access tokens revoked unless the box was unticked
 * (Decision 4), the audit row, and the notice to its address (sent once it commits, 189). Nobody
 * is signed in.
 */
export const completePasswordReset = async (
  deps: PasswordResetDeps,
  input: {
    token: string | null;
    password: unknown;
    confirm: unknown;
    revokeTokens: boolean;
    ip: string | null;
  },
): Promise<ResetCompleted> => {
  const at = clock(deps);
  if (!input.token) return { ok: false, refusal: "missing" };
  const flow = await deps.repo.flowByToken(resetTokenHash(input.token));
  if (flow?.step !== "new_password" || !flow.userId) return { ok: false, refusal: "spent" };
  const userId = flow.userId;
  if (flow.expiresAt <= at) {
    await deps.repo.transaction((repo) => repo.endFlow(flow.id, at));
    return { ok: false, refusal: "expired" };
  }
  if (!(await stillResettable(deps.repo, userId))) {
    await deps.repo.transaction((repo) => repo.endFlow(flow.id, at));
    return { ok: false, refusal: "cannot_continue" };
  }
  const twoFactorOn = await deps.twoFactor.enabled(userId);
  if (twoFactorOn && !flow.twoFactorAt) {
    const { token, hash } = newResetToken();
    const moved = await deps.repo.transaction((repo) =>
      repo.advanceFlow(flow.id, flow.tokenHash, {
        tokenHash: hash,
        step: "two_factor",
        expiresAt: flow.expiresAt,
      }),
    );
    if (!moved) return { ok: false, refusal: "spent" };
    return { ok: true, done: false, step: "two_factor", token };
  }
  const password = typeof input.password === "string" ? input.password : "";
  try {
    validatePassword(password);
  } catch (error) {
    if (error instanceof InvalidPasswordError)
      return {
        ok: false,
        refusal: error.reason === "too_short" ? "password_short" : "password_long",
      };
    throw error;
  }
  if (input.confirm !== password) return { ok: false, refusal: "mismatch" };
  // Hashed before the transaction: argon2 takes a while, and holds nothing.
  const passwordHash = await deps.hasher.hash(password);
  const done = await retryOnDeadlock(() =>
    deps.repo.transaction(async (repo): Promise<"done" | "spent" | "cannot_continue"> => {
      // The grant, once: a second submit, or a copy of the cookie, finds it gone.
      if (!(await repo.consumeGrant(flow.id, flow.tokenHash))) return "spent";
      // The account's row held, then read again: a change being made at this moment (made root,
      // disabled) is waited for and seen, never reset past.
      await repo.lockAccount(userId);
      if (!(await stillResettable(repo, userId))) return "cannot_continue";
      await repo.setPassword(userId, passwordHash, at);
      await repo.clearPasswordChange(userId, at);
      const sessionsEnded = await repo.deleteSessions(userId);
      await repo.endFlowsOf(userId, at);
      await repo.denyApprovedDeviceGrants(userId, at);
      const tokensRevoked = input.revokeTokens ? await repo.revokeAccessTokens(userId, at) : 0;
      await repo.recordAudit(
        {
          actorId: userId,
          action: "user.password_reset_by_email",
          target: { type: "user", id: userId },
          metadata: {
            sessionsEnded,
            tokensRevoked,
            tokensKept: !input.revokeTokens,
            twoFactor: flow.twoFactorAt !== null,
          },
          ipAddress: input.ip,
        },
        at,
      );
      await repo.queueResetNotice(userId, at);
      return "done";
    }),
  );
  if (done !== "done") return { ok: false, refusal: done };
  // A sign-in that checked the old password while the reset held the account can only write its
  // session once the reset has committed, so the transaction's delete never saw it. Its session
  // was stamped before the commit (Better Auth stamps it, then inserts), and a sign-in with the new
  // password comes after: once such inserts have landed, the account's sessions stamped up to the
  // commit end too.
  const committed = new Date();
  await (deps.wait ?? sleep)(RESET_SETTLE_MS);
  await deps.repo.deleteSessionsUpTo(userId, committed);
  return { ok: true, done: true };
};
