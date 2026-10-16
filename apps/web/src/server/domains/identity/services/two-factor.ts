import { logger } from "../../../log";
import { type LoginRateLimiter, loginRateLimitKeys } from "../models/login-rate-limiter";
import { PASSWORD_MAX_LENGTH } from "../models/password";
import { requirePermission } from "../models/permissions";
import { qrSvg } from "../models/qr";
import type { CurrentUser } from "../models/user";
import type { IdentityRepository } from "../repositories/identity-repository";
import type { SessionStore } from "../repositories/session-store";
import type { TwoFactorStatus, TwoFactorStore } from "../repositories/two-factor-store";
import type { RequestContext } from "./session";

export type TwoFactorDeps = {
  sessions: SessionStore;
  twoFactor: TwoFactorStore;
  repo: IdentityRepository;
  limiter: LoginRateLimiter;
  now?: () => Date;
};

const now = (deps: TwoFactorDeps) => (deps.now ?? (() => new Date()))();
const log = logger.child({ domain: "identity" });

/** Refusals every two-factor change can meet, besides its own. */
type Common =
  | { ok: false; error: "not_signed_in" | "no_password" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/**
 * A person's two-factor changes run one at a time, in this process (feature 105): starting,
 * confirming, new backup codes and turning off, from any tab or browser. So two never interleave
 * inside Better Auth's own reads and writes (a confirm racing a start could otherwise report "on"
 * with another secret stored), a double click does its work once and the second click sees the
 * result. Across processes (replicas, M17) this has to become shared: feature 111 lists it.
 */
const queues = new Map<string, Promise<unknown>>();
const oneAtATime = async <T>(key: string, work: () => Promise<T>): Promise<T> => {
  const before = queues.get(key) ?? Promise.resolve();
  const run = before.catch(() => {}).then(work);
  queues.set(key, run);
  try {
    return await run;
  } finally {
    if (queues.get(key) === run) queues.delete(key);
  }
};

/** When someone last got new backup codes, in this process: a second within this is refused. */
const REGENERATE_GAP_MS = 30_000;
const regenerated = new Map<string, number>();

/** The signed-in user who can change their own two-factor, and the session they're using. */
const signedIn = async (
  deps: TwoFactorDeps,
  context: RequestContext,
): Promise<{ user: CurrentUser; sessionId: string } | null> => {
  const session = await deps.sessions.currentSession(context.headers);
  const user = session ? await deps.repo.findActiveUser(session.userId) : null;
  if (!session || !user) return null;
  requirePermission(user, "account.manage_own");
  return { user, sessionId: session.sessionId };
};

/**
 * Runs a change as the signed-in user, in their queue. The session is read again inside it: a
 * change queued behind a confirm or a turn-off (which replace the session) finds it gone.
 */
const asSignedIn = async <T>(
  deps: TwoFactorDeps,
  context: RequestContext,
  work: (user: CurrentUser, sessionId: string) => Promise<T>,
): Promise<T | { ok: false; error: "not_signed_in" }> => {
  const first = await signedIn(deps, context);
  if (!first) return { ok: false, error: "not_signed_in" };
  return oneAtATime(first.user.id, async () => {
    const now = await signedIn(deps, context);
    if (!now) return { ok: false, error: "not_signed_in" } as const;
    return work(now.user, now.sessionId);
  });
};

/**
 * Wrong passwords and codes count against the sign-in limit (006), per email. The limit is checked
 * before every check is made, so once failures fill it even a right guess is refused (in a session,
 * Better Auth counts no failed codes of its own); only failures count, so ordinary use (a reload,
 * a typo, then the right code) never fills it.
 */
const keys = (user: CurrentUser) => loginRateLimitKeys(user.email, null);
const blocked = (
  deps: TwoFactorDeps,
  user: CurrentUser,
): { ok: false; error: "rate_limited"; retryAfterSeconds: number } | null => {
  const decision = deps.limiter.check(keys(user));
  return decision.allowed
    ? null
    : { ok: false, error: "rate_limited", retryAfterSeconds: decision.retryAfterSeconds };
};
/** Counts a wrong password or code, and gives back the refusal to answer with. */
const failed = <T>(deps: TwoFactorDeps, user: CurrentUser, result: T): T => {
  deps.limiter.record(keys(user));
  return result;
};

const badPassword = (password: string) =>
  password.length === 0 || [...password].length > PASSWORD_MAX_LENGTH;

const hasPassword = async (deps: TwoFactorDeps, user: CurrentUser) =>
  Boolean((await deps.repo.findCredentialByEmail(user.email))?.passwordHash);

/** Where the signed-in person's two-factor stands, for `/account/security`. */
export const twoFactorStatus = async (
  deps: TwoFactorDeps,
  context: RequestContext,
): Promise<(TwoFactorStatus & { hasPassword: boolean }) | null> => {
  const signed = await signedIn(deps, context);
  if (!signed) return null;
  const { user } = signed;
  return { ...(await deps.twoFactor.status(user.id)), hasPassword: await hasPassword(deps, user) };
};

export type StartTwoFactorResult =
  | { ok: true; uri: string; qrSvg: string; backupCodes: string[] }
  | { ok: false; error: "wrong_password" | "already_on" | "another_tab" }
  | Common;

/**
 * Starts enrolling: checks the password and hands out a QR code (and its URI) and ten backup codes.
 * Nothing is active until `confirmTwoFactor`. Starting again in the same browser (session) before
 * confirming shows the same setup (a reload, a second tab, a double click: every page shown
 * works); another browser, or `startOver`, makes a new one, and pages showing the old one are told
 * it was replaced. A new setup whose secret isn't the one
 * stored when it ends (another server started one meanwhile) shows nothing: it would never verify.
 */
export const startTwoFactor = (
  deps: TwoFactorDeps,
  context: RequestContext,
  input: { password: string; startOver?: boolean },
): Promise<StartTwoFactorResult> =>
  asSignedIn(deps, context, async (user, sessionId): Promise<StartTwoFactorResult> => {
    if (!(await hasPassword(deps, user))) return { ok: false, error: "no_password" };
    if ((await deps.twoFactor.status(user.id)).enabled) return { ok: false, error: "already_on" };
    const refused = blocked(deps, user);
    if (refused) return refused;
    if (
      badPassword(input.password) ||
      !(await deps.twoFactor.checkPassword(user.id, input.password))
    )
      return failed(deps, user, { ok: false, error: "wrong_password" } as const);
    // Started already in this browser and not confirmed: the same setup again, so every page
    // shown there works. Another browser gets a new one (owner, 2026-10-16): someone who has only
    // the password must never read a setup the person is about to confirm.
    if (!input.startOver && (await deps.twoFactor.setupSession(user.id)) === sessionId) {
      const pending = await deps.twoFactor.pending(context.headers, user.id, input.password);
      if (pending === "signed_out") return { ok: false, error: "not_signed_in" };
      if (pending)
        return {
          ok: true,
          uri: pending.uri,
          qrSvg: qrSvg(pending.uri),
          backupCodes: pending.backupCodes,
        };
    }
    const begun = await deps.twoFactor.begin(context.headers, input.password);
    if (!begun.ok)
      return begun.error === "signed_out"
        ? { ok: false, error: "not_signed_in" }
        : { ok: false, error: begun.error };
    if (!(await deps.twoFactor.holds(user.id, begun.enrolment.uri)))
      return { ok: false, error: "another_tab" };
    await deps.twoFactor.rememberSetupSession(user.id, sessionId);
    log.event("auth.two_factor_started", { userId: user.id });
    return {
      ok: true,
      uri: begun.enrolment.uri,
      qrSvg: qrSvg(begun.enrolment.uri),
      backupCodes: begun.enrolment.backupCodes,
    };
  });

export type ConfirmTwoFactorResult =
  | { ok: true; headers: Headers }
  | { ok: false; error: "wrong_code" | "already_on" | "replaced" }
  | Common;

/**
 * The first code from the authenticator app, for the enrolment this page showed (its `uri`): two
 * factor is on from here. Audited. An enrolment replaced since (started again in another tab, or
 * by a second click) is refused as `replaced`, not as a wrong code: its QR code can never verify.
 */
export const confirmTwoFactor = (
  deps: TwoFactorDeps,
  context: RequestContext,
  input: { code: string; uri: string },
): Promise<ConfirmTwoFactorResult> =>
  asSignedIn(deps, context, async (user): Promise<ConfirmTwoFactorResult> => {
    if ((await deps.twoFactor.status(user.id)).enabled) return { ok: false, error: "already_on" };
    if (!(await deps.twoFactor.holds(user.id, input.uri))) return { ok: false, error: "replaced" };
    const refused = blocked(deps, user);
    if (refused) return refused;
    const code = input.code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code))
      return failed(deps, user, { ok: false, error: "wrong_code" } as const);
    const headers = await deps.twoFactor.confirm(context.headers, code);
    if (headers === "signed_out") return { ok: false, error: "not_signed_in" };
    // Removed between the read-back and the check (turned off elsewhere): nothing to confirm.
    if (headers === "not_started") return { ok: false, error: "replaced" };
    if (headers === "wrong_code")
      return failed(deps, user, { ok: false, error: "wrong_code" } as const);
    await deps.repo.recordAudit(
      {
        actorId: user.id,
        action: "auth.two_factor_enabled",
        target: { type: "user", id: user.id },
        metadata: { method: "totp" },
        ipAddress: context.ip,
      },
      now(deps),
    );
    log.event("auth.two_factor_enabled", { userId: user.id });
    return { ok: true, headers };
  });

export type RegenerateBackupCodesResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: "wrong_password" | "not_enabled" | "just_made" }
  | Common;

/**
 * Ten new backup codes, shown once; the old ones stop working. Needs the password. Audited. A
 * second within 30 seconds is refused (`just_made`): a double click would otherwise show codes
 * the second click had already replaced.
 */
export const regenerateBackupCodes = (
  deps: TwoFactorDeps,
  context: RequestContext,
  input: { password: string },
): Promise<RegenerateBackupCodesResult> =>
  asSignedIn(deps, context, async (user): Promise<RegenerateBackupCodesResult> => {
    if (!(await deps.twoFactor.status(user.id)).enabled) return { ok: false, error: "not_enabled" };
    const last = regenerated.get(user.id);
    if (last !== undefined && now(deps).getTime() - last < REGENERATE_GAP_MS)
      return { ok: false, error: "just_made" };
    const refused = blocked(deps, user);
    if (refused) return refused;
    if (
      badPassword(input.password) ||
      !(await deps.twoFactor.checkPassword(user.id, input.password))
    )
      return failed(deps, user, { ok: false, error: "wrong_password" } as const);
    const codes = await deps.twoFactor.regenerateBackupCodes(context.headers, input.password);
    if (codes === "signed_out") return { ok: false, error: "not_signed_in" };
    if (!codes) return failed(deps, user, { ok: false, error: "wrong_password" } as const);
    regenerated.set(user.id, now(deps).getTime());
    await deps.repo.recordAudit(
      {
        actorId: user.id,
        action: "auth.backup_codes_regenerated",
        target: { type: "user", id: user.id },
        metadata: { count: codes.length },
        ipAddress: context.ip,
      },
      now(deps),
    );
    return { ok: true, backupCodes: codes };
  });

export type TurnOffTwoFactorResult =
  | { ok: true; headers: Headers }
  | { ok: false; error: "wrong_password" | "wrong_code" | "not_enabled" }
  | Common;

/**
 * Turns two-factor off: the password, then a code from the app or a backup code (someone who lost
 * their phone but kept the codes can still turn it off). The record is deleted. Audited.
 */
export const turnOffTwoFactor = (
  deps: TwoFactorDeps,
  context: RequestContext,
  input: { password: string; code: string },
): Promise<TurnOffTwoFactorResult> =>
  asSignedIn(deps, context, async (user): Promise<TurnOffTwoFactorResult> => {
    if (!(await deps.twoFactor.status(user.id)).enabled) return { ok: false, error: "not_enabled" };
    const refused = blocked(deps, user);
    if (refused) return refused;
    // The password first, so a wrong one never uses up a backup code.
    if (
      badPassword(input.password) ||
      !(await deps.twoFactor.checkPassword(user.id, input.password))
    )
      return failed(deps, user, { ok: false, error: "wrong_password" } as const);
    const code = input.code.trim();
    const right =
      code.length > 0 &&
      code.length <= 32 &&
      (await deps.twoFactor.checkCode(context.headers, code));
    if (right === "signed_out") return { ok: false, error: "not_signed_in" };
    if (!right) return failed(deps, user, { ok: false, error: "wrong_code" } as const);
    const headers = await deps.twoFactor.disable(context.headers, input.password);
    if (headers === "signed_out") return { ok: false, error: "not_signed_in" };
    if (!headers) return failed(deps, user, { ok: false, error: "wrong_password" } as const);
    regenerated.delete(user.id);
    await deps.repo.recordAudit(
      {
        actorId: user.id,
        action: "auth.two_factor_disabled",
        target: { type: "user", id: user.id },
        ipAddress: context.ip,
      },
      now(deps),
    );
    log.event("auth.two_factor_disabled", { userId: user.id });
    return { ok: true, headers };
  });
