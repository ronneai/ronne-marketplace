import { createHash, timingSafeEqual } from "node:crypto";
import { logger } from "../../../log";
import { ProviderFlowError, ProviderSecretUnreadableError } from "../exceptions/errors";
import type { ProviderWithSecret } from "../models/auth-provider-type";
import { clientIp } from "../models/client-ip";
import { type IdentityProvider, redirectUriFor } from "../models/identity-provider";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { ProviderTypeRegistry } from "../models/provider-types";
import { safeNextPath } from "../models/route-guard";
import { COOKIE_PREFIX } from "../models/session-cookie";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { kyselySsoRepository } from "../repositories/kysely-sso-repository";
import { decryptSecret } from "../repositories/provider-secrets";
import { PROVIDER_TYPES } from "../repositories/provider-type-registry";
import type { SsoSignInState } from "../repositories/sso-repository";
import { type SsoNotAllowed, signInWithProvider } from "../services/sso-sign-in";
import { finishTestSignIn } from "./test-sign-in";

/**
 * Signing in with an identity provider (feature 106): the start (a server action, from the
 * sign-in page's buttons) and the callback (`GET /api/auth/sso/callback/<id>`, a route of Ronne's
 * own). The sign-in in progress is a `verification` row under the state's hash, and the state is
 * also in a short-lived cookie scoped to the callback, so the callback only finishes in the
 * browser that started it, once, within 10 minutes.
 */

export const SSO_STATE_COOKIE = `${COOKIE_PREFIX}.sso_state`;
const CALLBACK_PATH = "/api/auth/sso/callback";
const STATE_TTL_SECONDS = 600;

/** Why a sign-in with a provider ends on the sign-in page, as `?error=`. */
export type SsoErrorCode =
  | "unverified_email"
  | "not_allowed"
  | "disabled"
  | "invalid_response"
  | "provider_error"
  | "unavailable"
  | "expired"
  | "rate_limited";

const log = logger.child({ domain: "identity" });

// Its own limiter (30 a minute per client IP): a company behind one address signs in together.
// When the address isn't known (no trusted proxy), every start and every callback shares one
// bucket for the instance (300 a minute each): a flood can't make Ronne call the provider or
// write rows without end, at worst holding up provider sign-in for a minute (passwords still work).
const shared = globalThis as typeof globalThis & {
  __ronneSsoLimiter?: LoginRateLimiter;
  __ronneSsoSharedLimiter?: LoginRateLimiter;
  __ronneSsoPrunedAt?: number;
};
const appLimiter = () => {
  if (!(shared.__ronneSsoLimiter instanceof LoginRateLimiter))
    shared.__ronneSsoLimiter = new LoginRateLimiter({ max: 30 });
  return shared.__ronneSsoLimiter;
};
const appSharedLimiter = () => {
  if (!(shared.__ronneSsoSharedLimiter instanceof LoginRateLimiter))
    shared.__ronneSsoSharedLimiter = new LoginRateLimiter({ max: 300 });
  return shared.__ronneSsoSharedLimiter;
};

export type SsoOptions = {
  types?: ProviderTypeRegistry;
  limiter?: LoginRateLimiter;
  /** The instance's bucket for requests whose client address isn't known. */
  sharedLimiter?: LoginRateLimiter;
  now?: () => Date;
};

/** Whether this start or callback may go on: per client IP, or the shared bucket without one. */
const allowed = (stage: "sso-start" | "sso-callback", ip: string | null, options: SsoOptions) =>
  ip
    ? (options.limiter ?? appLimiter()).consume([`${stage}:ip:${ip}`]).allowed
    : (options.sharedLimiter ?? appSharedLimiter()).consume([`${stage}:unknown`]).allowed;

/** Expired sign-ins in progress are deleted at most once a minute, by a start. */
const PRUNE_EVERY_MS = 60_000;

type Cookie = {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; secure: boolean; path: string; maxAge: number };
};

const hashState = (state: string) => createHash("sha256").update(state).digest("base64url");

const settings = async (app: AppAuth) => {
  const ctx = await app.auth.$context;
  const baseURL = String(ctx.options.baseURL ?? "http://localhost:3000").replace(/\/+$/, "");
  return { baseURL, secret: ctx.secret, secure: baseURL.startsWith("https://") };
};

const withSecret = (
  provider: IdentityProvider,
  secretEnc: string | null,
  authSecret: string,
): ProviderWithSecret => ({
  ...provider,
  secret: secretEnc ? decryptSecret(authSecret, provider.id, secretEnc) : null,
});

/** The `Set-Cookie` that removes the state cookie. */
const clearStateCookie = (secure: boolean) =>
  `${SSO_STATE_COOKIE}=; Path=${CALLBACK_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

/** The state cookie's value in a request, or null. */
const stateCookie = (headers: Headers): string | null => {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === SSO_STATE_COOKIE) {
      try {
        return decodeURIComponent(part.slice(at + 1).trim());
      } catch {
        // Malformed escapes: no usable state (the sign-in has expired, not crashed).
        return null;
      }
    }
  }
  return null;
};

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export type StartResult =
  | { ok: true; url: string; cookie: Cookie }
  | { ok: false; error: "unavailable" | "provider_error" | "rate_limited" };

/**
 * Starts a sign-in with a provider: the address to send the browser to, and the state cookie to
 * set. `test` makes it a *Test sign-in* of this version of the provider (task 6).
 */
export const startSsoSignIn = async (
  headers: Headers,
  input: { provider: string; next?: string | null; test?: SsoSignInState["test"] },
  app: AppAuth = getAppAuth(),
  options: SsoOptions = {},
): Promise<StartResult> => {
  const now = (options.now ?? (() => new Date()))();
  const ip = clientIp(headers, app.trustProxy);
  if (!allowed("sso-start", ip, options)) return { ok: false, error: "rate_limited" };
  const providers = kyselyIdentityProviderRepository(app.db, app.dialect);
  const stored = typeof input.provider === "string" ? await providers.find(input.provider) : null;
  if (!stored || (!stored.provider.enabled && !input.test))
    return { ok: false, error: "unavailable" };
  const { provider } = stored;
  const { baseURL, secure } = await settings(app);
  const type = (options.types ?? PROVIDER_TYPES).get(provider.type);
  let started: Awaited<ReturnType<typeof type.start>>;
  try {
    // The start needs no secret: only the callback's token request does.
    started = await type.start(
      { ...provider, secret: null },
      {
        redirectUri: redirectUriFor(baseURL, provider.id),
      },
    );
  } catch (error) {
    if (!(error instanceof ProviderFlowError)) throw error;
    await providers.recordFailure(provider.id, error.reason, now);
    log.event("auth.sso_failed", {
      provider: provider.id,
      reason: error.reason,
      detail: error.detail,
    });
    return { ok: false, error: "provider_error" };
  }
  const sso = kyselySsoRepository(app.db, app.dialect);
  if (Math.abs(now.getTime() - (shared.__ronneSsoPrunedAt ?? 0)) >= PRUNE_EVERY_MS) {
    shared.__ronneSsoPrunedAt = now.getTime();
    await sso.pruneStates(now);
  }
  await sso.saveState(
    hashState(started.state),
    {
      provider: provider.id,
      keep: started.keep,
      next: safeNextPath(input.next),
      test: input.test ?? null,
    },
    now,
    new Date(now.getTime() + STATE_TTL_SECONDS * 1000),
  );
  return {
    ok: true,
    url: started.url,
    cookie: {
      name: SSO_STATE_COOKIE,
      value: started.state,
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: CALLBACK_PATH,
        maxAge: STATE_TTL_SECONDS,
      },
    },
  };
};

/**
 * The callback: checks the state against the cookie and takes the sign-in in progress (once), has
 * the type verify the provider's answer, decides who it is (services/sso-sign-in.ts), and opens
 * the session like a password sign-in. Every refusal goes to `/sign-in?error=<code>` with a plain
 * message, audited as `auth.sso_failed`; the provider's own error text is only logged.
 */
export const completeSsoSignIn = async (
  request: Request,
  providerId: string,
  app: AppAuth = getAppAuth(),
  options: SsoOptions = {},
): Promise<Response> => {
  const now = (options.now ?? (() => new Date()))();
  const headers = request.headers;
  const ip = clientIp(headers, app.trustProxy);
  const { baseURL, secret, secure } = await settings(app);
  const providers = kyselyIdentityProviderRepository(app.db, app.dialect);
  const sso = kyselySsoRepository(app.db, app.dialect);
  let next = "/";

  const redirect = (location: string, cookies: string[] = []) => {
    const response = new Response(null, {
      status: 302,
      headers: { location, "cache-control": "no-store" },
    });
    response.headers.append("set-cookie", clearStateCookie(secure));
    for (const cookie of cookies) response.headers.append("set-cookie", cookie);
    return response;
  };

  const fail = async (
    reason: SsoErrorCode,
    extra: { email?: string; detail?: string; why?: SsoNotAllowed } = {},
  ) => {
    log.event("auth.sso_failed", { provider: providerId, reason, detail: extra.detail });
    await sso.recordAudit(
      {
        actorId: null,
        action: "auth.sso_failed",
        target: { type: "none" },
        metadata: {
          provider: providerId.slice(0, 32),
          reason,
          ...(extra.why ? { why: extra.why } : {}),
          ...(extra.email ? { email: extra.email.slice(0, 255) } : {}),
        },
        ipAddress: ip,
      },
      now,
    );
    const query = new URLSearchParams({ error: reason });
    if (next !== "/") query.set("next", next);
    return redirect(`${baseURL}/sign-in?${query}`);
  };

  if (!allowed("sso-callback", ip, options)) return fail("rate_limited");

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const cookie = stateCookie(headers);
  if (!state || !cookie || !sameText(state, cookie)) return fail("expired");
  const taken = await sso.takeState(hashState(state), now);
  if (!taken || taken.state.provider !== providerId) return fail("expired");
  next = safeNextPath(taken.state.next);

  const stored = await providers.find(providerId);
  if (!stored || (!stored.provider.enabled && !taken.state.test)) return fail("unavailable");
  const type = (options.types ?? PROVIDER_TYPES).get(stored.provider.type);

  const run = () =>
    type.complete(withSecret(stored.provider, stored.secretEnc, secret), {
      url,
      redirectUri: redirectUriFor(baseURL, providerId),
      keep: taken.state.keep,
      startedAt: taken.startedAt,
    });

  // A *Test sign-in* (106): shows what came back, changes nothing, opens no session.
  if (taken.state.test) {
    const location = await finishTestSignIn({
      app,
      headers,
      providerId,
      test: taken.state.test,
      run,
      next,
    });
    return redirect(`${baseURL}${location}`);
  }

  let identity: Awaited<ReturnType<typeof type.complete>>;
  try {
    identity = await run();
  } catch (error) {
    if (error instanceof ProviderSecretUnreadableError) {
      await providers.recordFailure(providerId, "secret_unreadable", now);
      return fail("provider_error", { detail: "the client secret can't be decrypted" });
    }
    if (!(error instanceof ProviderFlowError)) throw error;
    await providers.recordFailure(providerId, error.reason, now);
    return fail(error.reason, { detail: error.detail });
  }

  const outcome = await signInWithProvider(sso, stored.provider, identity, { ip, now });
  if (!outcome.ok) return fail(outcome.reason, { email: identity.email, why: outcome.why });

  const session = await betterAuthSessionStore(app.auth).startSession(headers, outcome.userId);
  // Disabled between the decision and the session: the same answer as a disabled account.
  if (!session) return fail("disabled", { email: identity.email });
  await sso.recordAudit(
    {
      actorId: outcome.userId,
      action: "auth.signed_in",
      target: { type: "session", id: session.session.sessionId },
      metadata: { remember: false, via: "sso", provider: providerId },
      ipAddress: ip,
    },
    now,
  );
  await sso.recordAudit(
    {
      actorId: outcome.userId,
      action: "auth.sso_signed_in",
      target: { type: "user", id: outcome.userId },
      metadata: { provider: providerId },
      ipAddress: ip,
    },
    now,
  );
  await providers.recordSignIn(providerId, now);
  log.event("auth.sso_signed_in", { userId: outcome.userId, provider: providerId });
  return redirect(`${baseURL}${next}`, session.headers.getSetCookie());
};
