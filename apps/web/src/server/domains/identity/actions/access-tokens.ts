import { clientIp } from "../models/client-ip";
import { argon2PasswordHasher } from "../repositories/argon2-password-hasher";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselyTokenRepository } from "../repositories/kysely-token-repository";
import * as service from "../services/access-tokens";
import { exchangePasswordForToken } from "../services/token-exchange";
import { getCurrentUser } from "./session";

export type { Authenticated, NewToken, TokenFailure } from "../services/access-tokens";

/**
 * Entry points for /account/tokens and the API (feature 009). Thin: they find who's asking and
 * wire the dependencies; the services check the permission. `app` defaults to the running server.
 */
const deps = ({ db, dialect }: AppAuth): service.TokenDeps => ({
  repo: kyselyTokenRepository(db, dialect),
});

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
    },
    input,
    { ip: clientIp(headers, app.trustProxy), userAgent: headers.get("user-agent") },
  );
