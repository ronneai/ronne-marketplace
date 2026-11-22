import { newId } from "../../../db/ids";
import type { RateLimitStore } from "../../../rate-limit/rate-limiter";
import type { QueuedMail } from "../../mail/services/outbox";
import { renderMail } from "../../mail/services/templates";
import { InvalidEmailError, InvalidNameError, InvalidPasswordError } from "../exceptions/errors";
import { reserveEmailCodeSend } from "../models/email-code";
import { isLocale, type Locale } from "../models/locale";
import { validatePassword } from "../models/password";
import type { PasswordHasher } from "../models/password-hasher";
import {
  checkChallengeAnswer,
  checkForm,
  parseChallengeAnswer,
  plainName,
  SIGN_UP_ADDRESS_LIMIT,
  SIGN_UP_BOT_AUDIT_LIMIT,
  SIGN_UP_CODE_IP_LIMIT,
  SIGN_UP_IP_LIMIT,
  signUpDomainAllowed,
} from "../models/sign-up-guard";
import { normalizeEmail, normalizeName } from "../models/user";
import type { ExistingAccount, SignUpRepository } from "../repositories/sign-up-repository";

/**
 * Self-registration (190): a person asks for an account, proves the address with a 6-digit code,
 * and only then is the account written. An address that has an account gets the same answer and
 * the same page; its owner gets "you already have an account" instead of a code. Nothing here
 * signs anyone in (Decision 6).
 */

/** What sign-up reads of the instance, each time: root's settings and whether it's open. */
export type SignUpOpenness = {
  /** On, and email, the instance contact and password sign-in are all ready. */
  open: boolean;
  domains: "any" | readonly string[];
  blockThrowaway: boolean;
  approval: boolean;
  codeMinutes: number;
  challenge: boolean;
  termsUrl: string;
  termsVersion: string;
};

export type SignUpDeps = {
  repo: SignUpRepository;
  hasher: PasswordHasher;
  /** 109's database-backed limits. */
  limits: RateLimitStore;
  authSecret: string;
  /** Read at every step, so a change by root counts at once. */
  openness: () => Promise<SignUpOpenness>;
  /** What the emails say: the instance's host and contact. */
  mail: () => Promise<{ host: string; contact: string }>;
  now?: () => Date;
};

const PURPOSE = "sign_up" as const;
const clock = (deps: SignUpDeps) => (deps.now ?? (() => new Date()))();

/** Why a sign-up form is sent back. `field` names the box it's about. */
export type SignUpRefusal =
  | "closed"
  | "stale"
  | "challenge"
  | "limited"
  | "invalid_email"
  | "domain_not_allowed"
  | "name"
  | "password_short"
  | "password_long"
  | "terms";

export type SignUpRequest = {
  name: unknown;
  email: unknown;
  password: unknown;
  termsAccepted: boolean;
  locale: unknown;
  stamp: unknown;
  honeypot: unknown;
  challenge: unknown;
  /** The client's IP, only with `TRUST_PROXY=true`. */
  ip: string | null;
  /** The sign-up this browser had before, which a new one ends. */
  previous: string | null;
};

export type SignUpRequested =
  /** The code page, for a new address and an existing one alike. `id` goes in the cookie. */
  | { ok: true; id: string }
  | { ok: false; refusal: SignUpRefusal; field?: "name" | "email" | "password" | "terms" };

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

/** Plain ASCII, no space or control character inside (106's rule, `sso-sign-in.ts`). */
const PLAIN_EMAIL = /^[\x21-\x7e]+$/;

/** The address as stored, or null when it isn't one sign-up takes: ASCII only, at most 254. */
export const signUpEmail = (typed: string): string | null => {
  const raw = typed.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if (raw.length > 254 || !PLAIN_EMAIL.test(raw) || raw.split("@").length !== 2) return null;
  let email: string;
  try {
    email = normalizeEmail(raw);
  } catch (error) {
    if (error instanceof InvalidEmailError) return null;
    throw error;
  }
  // The domain a host name, nothing more: `acme.com/x` or `acme.com#y` would read as acme.com.
  return HOST_NAME.test(email.slice(email.indexOf("@") + 1)) ? email : null;
};

const HOST_NAME =
  /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Queues the email a sign-up sends: the code to a new address, or "you already have an account"
 * to the address as the account stores it. An address the database only calls equal to an
 * account's (MySQL's accent-blind comparison) gets nothing: it isn't that account's.
 */
const queueSignUpMail = async (
  sender: { host: string; contact: string },
  repo: SignUpRepository,
  input: {
    email: string;
    existing: ExistingAccount | null;
    locale: Locale;
    code: string;
    expiresAt: Date;
    minutes: number;
    /** A bot's: written and checked as if queued, then dropped. */
    dropped?: boolean;
  },
  at: Date,
) => {
  const { email, existing, locale, code, expiresAt, minutes } = input;
  if (existing && existing.email !== email) return;
  const kind = existing ? "sign_up_existing" : "sign_up_code";
  // Rendered here, inside the transaction, from what was read before it: on SQLite's one
  // connection, a read outside the transaction would wait for it forever.
  const words = await renderMail(kind, locale, { ...sender, at, code, minutes });
  const mail: QueuedMail = existing
    ? { template: kind, locale, to: existing.email, userId: existing.id, ...words }
    : { template: kind, locale, to: email, userId: null, expiresAt, ...words };
  if (input.dropped) await repo.rehearseMail(mail, at);
  else await repo.queueMail(mail, at);
};

const minutesOf = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60_000);

/**
 * Someone asks for an account (190). The checks run cheapest first: open, the form's stamp and
 * honeypot, the per-IP limit, the challenge, the fields, the domain, the per-address limit. Then
 * the password is hashed and a code issued whether or not the address has an account, so both
 * take the same time and give the same answer; only the email differs.
 */
export const requestSignUp = async (
  deps: SignUpDeps,
  input: SignUpRequest,
): Promise<SignUpRequested> => {
  const at = clock(deps);
  const policy = await deps.openness();
  if (!policy.open) return { ok: false, refusal: "closed" };
  // Kept as typed: trim() would drop a no-break space the ASCII check must see.
  const typedEmail = text(input.email, 1024);
  const record = (outcome: string, email: string) =>
    deps.repo.recordAudit(
      {
        actorId: null,
        action: "auth.sign_up_requested",
        target: { type: "none" },
        metadata: { email: email.trim().slice(0, 254), outcome },
        ipAddress: input.ip,
      },
      at,
    );
  // A code sent, or an existing address told, is recorded each time: each cost an email. Every
  // other outcome costs a forged post next to nothing, so root hears of those up to a cap.
  const audit = async (outcome: string, email: string) => {
    if (outcome === "sent" || outcome === "existing") return record(outcome, email);
    const decision = await deps.limits.consume(
      [{ limit: SIGN_UP_BOT_AUDIT_LIMIT, key: "instance" }],
      at.getTime(),
    );
    if (decision.allowed) await record(outcome, email);
  };

  // The per-IP limit first, so a flood from one address is refused before anything else.
  if (input.ip) {
    const decision = await deps.limits.consume(
      [{ limit: SIGN_UP_IP_LIMIT, key: input.ip }],
      at.getTime(),
    );
    // Over it, nothing is recorded: a flood would fill the audit log.
    if (!decision.allowed) return { ok: false, refusal: "limited" };
  }

  // A bot goes on as a person would, to the same code page, and gets nothing (SPEC "A bot").
  const form = checkForm(deps.authSecret, { stamp: input.stamp, honeypot: input.honeypot }, at);
  const bot = form === "bot";
  if (form === "stale") return { ok: false, refusal: "stale" };

  if (policy.challenge) {
    const answer = parseChallengeAnswer(input.challenge);
    const check = answer ? checkChallengeAnswer(deps.authSecret, answer, at) : null;
    if (
      check?.result !== "ok" ||
      !(await deps.repo.takeChallenge(check.challengeHmac, check.expiresAt))
    ) {
      await audit("challenge", typedEmail);
      return { ok: false, refusal: "challenge" };
    }
  }

  let name: string;
  try {
    name = normalizeName(text(input.name, 1024));
    // A NUL breaks PostgreSQL's insert; line breaks and bidi marks would show in Users and the audit.
    if (!plainName(name)) throw new InvalidNameError();
  } catch (error) {
    if (error instanceof InvalidNameError) return { ok: false, refusal: "name", field: "name" };
    throw error;
  }
  const email = signUpEmail(typedEmail);
  if (!email) return { ok: false, refusal: "invalid_email", field: "email" };
  const password = typeof input.password === "string" ? input.password : "";
  try {
    validatePassword(password);
  } catch (error) {
    if (error instanceof InvalidPasswordError)
      return {
        ok: false,
        refusal: error.reason === "too_short" ? "password_short" : "password_long",
        field: "password",
      };
    throw error;
  }
  if (policy.termsUrl && !input.termsAccepted)
    return { ok: false, refusal: "terms", field: "terms" };
  if (!signUpDomainAllowed(policy, email)) {
    await audit("domain_not_allowed", email);
    return { ok: false, refusal: "domain_not_allowed", field: "email" };
  }
  const perAddress = await deps.limits.consume(
    [{ limit: SIGN_UP_ADDRESS_LIMIT, key: email }],
    at.getTime(),
  );
  if (!perAddress.allowed) {
    await audit("limited", email);
    return { ok: false, refusal: "limited" };
  }

  // Both paths from here: the hash, the code, the pending row and one email.
  const passwordHash = await deps.hasher.hash(password);
  const id = newId();
  const send = await reserveEmailCodeSend(
    deps.limits,
    deps.authSecret,
    { purpose: PURPOSE, subjectId: id, email },
    at,
  );
  if (!send.ok) {
    await audit("limited", email);
    return { ok: false, refusal: "limited" };
  }
  const locale: Locale = isLocale(input.locale) ? input.locale : "en";
  const sender = await deps.mail();
  const outcome = await deps.repo.transaction(async (repo) => {
    // Signing up again in this browser starts over: the sign-up before and its code end.
    if (input.previous) await repo.deletePending(input.previous, at);
    const existing = await repo.findAccount(email);
    const issued = await repo.issueCode({
      purpose: PURPOSE,
      subjectId: id,
      email,
      minutes: policy.codeMinutes,
      now: at,
    });
    if (!issued.ok) return "limited" as const;
    await repo.insertPending({
      id,
      email,
      name,
      // No account can come of a bot's sign-up or of an address that has one: no hash.
      passwordHash: existing || bot ? null : passwordHash,
      locale,
      termsVersion: policy.termsUrl ? policy.termsVersion : null,
      termsAcceptedAt: policy.termsUrl ? at : null,
      createdAt: at,
      expiresAt: issued.expiresAt,
    });
    // A bot's email is written and dropped: the same work, so it takes as long, and nothing sent.
    await queueSignUpMail(
      sender,
      repo,
      {
        email,
        existing,
        locale,
        code: issued.code,
        expiresAt: issued.expiresAt,
        minutes: minutesOf(at, issued.expiresAt),
        dropped: bot,
      },
      at,
    );
    if (bot) return "bot" as const;
    return existing ? ("existing" as const) : ("sent" as const);
  });
  await audit(outcome, email);
  if (outcome === "limited") return { ok: false, refusal: "limited" };
  return { ok: true, id };
};

/** What the code page shows: the address, and when a new code can be asked for. */
export type CodePage = { email: string; resendAt: Date; expiresAt: Date };

/** The code page of this browser's sign-up, or null when it has none or it has ended. */
export const codePage = async (deps: SignUpDeps, id: string | null): Promise<CodePage | null> => {
  if (!id) return null;
  const at = clock(deps);
  const pending = await deps.repo.pending(id);
  if (!pending || pending.expiresAt <= at) return null;
  const last = (await deps.repo.lastCodeAt(id)) ?? pending.createdAt;
  return {
    email: pending.email,
    resendAt: new Date(last.getTime() + 60_000),
    expiresAt: pending.expiresAt,
  };
};

export type CodeRefusal =
  /** A wrong code: try again. */
  | "wrong"
  /** Five wrong codes, or the code has ended: ask for a new one. */
  | "spent"
  /** The sign-up itself has ended, or this browser has none: start again. */
  | "ended"
  /** Root closed sign-up, or the domain, meanwhile. */
  | "closed"
  /** An account was made for the address meanwhile: they proved the inbox, so it can be said. */
  | "exists"
  | "limited";

export type CodeChecked =
  | { ok: true; email: string; waiting: boolean }
  | { ok: false; refusal: CodeRefusal };

/**
 * The code typed on the code page (190). Right, the account is written in the same transaction
 * that uses the code, with the rules checked again; anything else spends a try. A sign-up for an
 * address that has an account has a code no one was sent: even guessed, it's only wrong.
 */
export const enterSignUpCode = async (
  deps: SignUpDeps,
  input: { id: string | null; code: unknown; ip: string | null },
): Promise<CodeChecked> => {
  const at = clock(deps);
  if (input.ip) {
    const decision = await deps.limits.consume(
      [{ limit: SIGN_UP_CODE_IP_LIMIT, key: input.ip }],
      at.getTime(),
    );
    if (!decision.allowed) return { ok: false, refusal: "limited" };
  }
  const id = input.id;
  if (!id) return { ok: false, refusal: "ended" };
  const policy = await deps.openness();
  const failed = (repo: SignUpRepository, email: string, reason: string) =>
    repo.recordAudit(
      {
        actorId: null,
        action: "auth.sign_up_code_failed",
        target: { type: "none" },
        metadata: { email, reason },
        ipAddress: input.ip,
      },
      at,
    );
  const run = () =>
    deps.repo.transaction(async (repo): Promise<CodeChecked> => {
      const pending = await repo.pending(id);
      if (!pending || pending.expiresAt <= at) return { ok: false, refusal: "ended" };
      if (!policy.open || !signUpDomainAllowed(policy, pending.email)) {
        await repo.deletePending(id, at);
        await failed(repo, pending.email, "closed");
        return { ok: false, refusal: "closed" };
      }
      const check = await repo.verifyCode({
        purpose: PURPOSE,
        subjectId: id,
        typed: typeof input.code === "string" ? input.code : "",
        now: at,
      });
      if (check.result !== "ok" || pending.passwordHash === null) {
        const reason =
          check.result === "ok"
            ? "wrong"
            : check.result === "used"
              ? "spent"
              : check.result === "expired"
                ? "expired"
                : check.result === "spent"
                  ? "spent"
                  : check.result === "none"
                    ? "none"
                    : "wrong";
        await failed(repo, pending.email, reason);
        return {
          ok: false,
          refusal: reason === "expired" || reason === "spent" ? "spent" : "wrong",
        };
      }
      if (await repo.findAccount(pending.email)) {
        await repo.deletePending(id, at);
        await failed(repo, pending.email, "exists");
        return { ok: false, refusal: "exists" };
      }
      const userId = await repo.createAccount({
        email: pending.email,
        name: pending.name,
        passwordHash: pending.passwordHash,
        locale: pending.locale,
        approval: policy.approval,
        termsVersion: pending.termsVersion,
        termsAcceptedAt: pending.termsAcceptedAt,
        now: at,
      });
      await repo.deletePending(id, at);
      await repo.recordAudit(
        {
          actorId: userId,
          action: "user.signed_up",
          target: { type: "user", id: userId },
          metadata: { email: pending.email, how: "password", approval: policy.approval },
          ipAddress: input.ip,
        },
        at,
      );
      return { ok: true, email: pending.email, waiting: policy.approval };
    });
  try {
    return await run();
  } catch (error) {
    // Two right codes for one address at once: the unique index lets one account in, and the
    // other's transaction fails. Once the account is there, that's "exists", said as above.
    const pending = await deps.repo.pending(id);
    if (pending && (await deps.repo.findAccount(pending.email))) {
      await deps.repo.transaction(async (repo) => {
        await repo.deletePending(id, at);
        await failed(repo, pending.email, "exists");
      });
      return { ok: false, refusal: "exists" };
    }
    throw error;
  }
};

export type ResendResult =
  | { ok: true }
  | { ok: false; refusal: "ended" | "closed" | "limited" }
  | { ok: false; refusal: "wait"; seconds: number };

/**
 * **Send a new code** (190): a new code ends the one before. One a minute for the sign-up, and
 * three an hour to the address, counted before the transaction (`reserveEmailCodeSend`).
 */
export const resendSignUpCode = async (
  deps: SignUpDeps,
  input: { id: string | null; ip: string | null },
): Promise<ResendResult> => {
  const at = clock(deps);
  const id = input.id;
  if (!id) return { ok: false, refusal: "ended" };
  const pending = await deps.repo.pending(id);
  if (!pending || pending.expiresAt <= at) return { ok: false, refusal: "ended" };
  const policy = await deps.openness();
  if (!policy.open || !signUpDomainAllowed(policy, pending.email))
    return { ok: false, refusal: "closed" };
  const send = await reserveEmailCodeSend(
    deps.limits,
    deps.authSecret,
    { purpose: PURPOSE, subjectId: id, email: pending.email },
    at,
  );
  if (!send.ok)
    return send.reason === "wait"
      ? { ok: false, refusal: "wait", seconds: send.seconds }
      : { ok: false, refusal: "limited" };
  const locale: Locale = isLocale(pending.locale) ? pending.locale : "en";
  const sender = await deps.mail();
  return deps.repo.transaction(async (repo): Promise<ResendResult> => {
    const issued = await repo.issueCode({
      purpose: PURPOSE,
      subjectId: id,
      email: pending.email,
      minutes: policy.codeMinutes,
      now: at,
    });
    if (!issued.ok)
      return issued.reason === "wait"
        ? { ok: false, refusal: "wait", seconds: issued.seconds }
        : { ok: false, refusal: "limited" };
    await repo.extendPending(id, issued.expiresAt);
    // No hash: an address that has an account (its owner hears again), or a bot's sign-up, or an
    // account erased meanwhile. With no account, nothing is sent: no code of it could work.
    const existing = pending.passwordHash === null ? await repo.findAccount(pending.email) : null;
    if (pending.passwordHash === null && !existing) return { ok: true };
    await queueSignUpMail(
      sender,
      repo,
      {
        email: pending.email,
        existing,
        locale,
        code: issued.code,
        expiresAt: issued.expiresAt,
        minutes: minutesOf(at, issued.expiresAt),
      },
      at,
    );
    return { ok: true };
  });
};

/** **Use another email**: this browser's sign-up ends. */
export const cancelSignUp = async (deps: SignUpDeps, id: string | null): Promise<void> => {
  if (!id) return;
  const at = clock(deps);
  await deps.repo.transaction((repo) => repo.deletePending(id, at));
};
