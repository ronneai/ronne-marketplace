import { clientIp } from "../models/client-ip";
import { requirePermission } from "../models/permissions";
import type { CurrentUser } from "../models/user";
import { argon2PasswordHasher } from "../repositories/argon2-password-hasher";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/access-tokens";
import { exchangePasswordForToken } from "../services/token-exchange";
import { effectivePasswordPolicy } from "./password-policy";
import { getCurrentUser } from "./session";
import { tokenDeps } from "./token-deps";

export type { Authenticated, NewToken, TokenFailure } from "../services/access-tokens";

/**
 * Entry points for /account/tokens and the API (feature 009). Thin: they find who's asking and
 * wire the dependencies; the services check the permission. `app` defaults to the running server.
 */
const deps = (app: AppAuth): service.TokenDeps => tokenDeps(app);

const actor = async (headers: Headers, app: AppAuth): Promise<service.TokenActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export const listMyTokens = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.listTokens(deps(app), await actor(headers, app));

export const createMyToken = async (
  headers: Headers,
  input: { name: string; lifetime?: string | number | null },
  app: AppAuth = getAppAuth(),
) => service.createToken(deps(app), await actor(headers, app), { ...input, via: "web" });

export const revokeMyToken = async (
  headers: Headers,
  tokenId: string,
  app: AppAuth = getAppAuth(),
) => service.revokeToken(deps(app), await actor(headers, app), tokenId);

/** A person's tokens, for root on their page (162). */
export const adminListTokens = async (
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) => service.listTokensOf(deps(app), await actor(headers, app), userId);

/** Root revokes one of a person's tokens (162). */
export const adminRevokeToken = async (
  headers: Headers,
  userId: string,
  tokenId: string,
  app: AppAuth = getAppAuth(),
) => service.revokeTokenOf(deps(app), await actor(headers, app), userId, tokenId);

/** The longest lifetime the signed-in person may give a token now (162), for the dialog. */
export const myTokenCap = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { user } = await actor(headers, app);
  requirePermission(user, "account.manage_own");
  return service.tokenCapOf(deps(app), user as CurrentUser);
};

/** Checks a bearer token for the API (the guard in server/http/require-token.ts). */
export const authenticateToken = (token: string | null, app: AppAuth = getAppAuth()) =>
  service.authenticateToken(deps(app), token);

/** Revokes the token that made an API request (`rmk logout`). */
export const revokeCallingToken = (
  auth: service.Authenticated,
  headers: Headers,
  app: AppAuth = getAppAuth(),
) =>
  service.revokeToken(
    deps(app),
    { user: auth.user, ip: clientIp(headers, app.trustProxy) },
    auth.token.id,
  );

/** `rmk login`: an email and password in exchange for a token, with no web session. */
export const exchangePassword = (
  input: { email: unknown; password: unknown; name?: unknown },
  headers: Headers,
  app: AppAuth = getAppAuth(),
) =>
  exchangePasswordForToken(
    {
      identity: kyselyIdentityRepository(app.db, app.dialect),
      tokens: deps(app),
      hasher: argon2PasswordHasher,
      limiter: app.limiter,
      passwordPolicy: () => effectivePasswordPolicy(app),
    },
    input,
    { ip: clientIp(headers, app.trustProxy), userAgent: headers.get("user-agent") },
  );
