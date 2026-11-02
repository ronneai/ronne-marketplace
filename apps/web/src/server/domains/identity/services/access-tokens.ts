import { logger } from "../../../log";
import {
  capFor,
  capWithin,
  type TokenCap,
  type TokenPolicy,
} from "../../settings/models/token-policy";
import {
  TokenLifetimeTooLongError,
  TokenLimitError,
  TokenNameTakenError,
  TokenNotFoundError,
} from "../exceptions/errors";
import {
  type AccessTokenSummary,
  DEFAULT_TOKEN_LIFETIME,
  generateToken,
  hashToken,
  isTokenFormat,
  MAX_ACTIVE_TOKENS,
  normalizeTokenName,
  parseTokenLifetime,
  type TokenLifetime,
  tokenExpiry,
  tokenPreview,
} from "../models/access-token";
import { requirePermission } from "../models/permissions";
import { coveredBy } from "../models/two-factor-coverage";
import type { CurrentUser } from "../models/user";
import type { TokenRepository, TokenVia } from "../repositories/token-repository";

/**
 * Personal access tokens (feature 009). Owners create, list and revoke their own; the bearer guard
 * authenticates API requests with them. The plain token only ever exists in `createToken`'s result.
 */
export type TokenDeps = {
  repo: TokenRepository;
  /** Root's longest lifetimes (162), read every time a token is made. */
  policy: () => Promise<TokenPolicy>;
  now?: () => Date;
};

/** Who's acting, and from where (the client IP, when it can be trusted). */
export type TokenActor = { user: CurrentUser | null; ip: string | null };

const now = (deps: TokenDeps) => (deps.now ?? (() => new Date()))();

export type NewToken = { token: string; id: string; name: string; expiresAt: Date | null };

/**
 * The longest lifetime this person may give a token now (162): the reviewers' cap for root and
 * anyone who reviews in a shared workspace, as the two-factor policy counts them, whatever way they
 * sign in (company sign-in included: their tokens reach as far); everyone's cap otherwise. Read when
 * the token is made: a role gained later doesn't touch tokens already made.
 */
export const tokenCapOf = async (deps: TokenDeps, user: CurrentUser): Promise<TokenCap> =>
  capFor(await deps.policy(), coveredBy("reviewers", user, true));

/**
 * The lifetime a token gets: the one asked for, refused when it's longer than the cap; or, when
 * none is asked for (the dialog's default, `rmk login`, the device flow), 90 days or the cap when
 * that's shorter.
 */
const lifetimeWithin = (asked: TokenLifetime | undefined, cap: TokenCap): TokenLifetime => {
  if (asked === undefined)
    return capWithin(DEFAULT_TOKEN_LIFETIME, cap) ? DEFAULT_TOKEN_LIFETIME : (cap as TokenLifetime);
  if (!capWithin(asked, cap)) throw new TokenLifetimeTooLongError(cap as number);
  return asked;
};

export const createToken = async (
  deps: TokenDeps,
  actor: TokenActor,
  input: { name: string; lifetime?: string | number | null; via: TokenVia },
): Promise<NewToken> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user as CurrentUser;
  const name = normalizeTokenName(input.name);
  const asked =
    input.lifetime === undefined || input.lifetime === ""
      ? undefined
      : parseTokenLifetime(input.lifetime);
  const lifetime = lifetimeWithin(asked, await tokenCapOf(deps, user));
  const at = now(deps);
  const expiresAt = tokenExpiry(lifetime, at);
  const token = generateToken();

  const id = await deps.repo.transaction(async (repo) => {
    if ((await repo.countActive(user.id, at)) >= MAX_ACTIVE_TOKENS)
      throw new TokenLimitError(MAX_ACTIVE_TOKENS);
    if (await repo.activeNameTaken(user.id, name, at)) throw new TokenNameTakenError(name);
    const created = await repo.insert({
      userId: user.id,
      name,
      tokenHash: hashToken(token),
      tokenPrefix: tokenPreview(token),
      expiresAt,
      createdAt: at,
      via: input.via,
    });
    await repo.recordAudit(
      {
        actorId: user.id,
        action: "access_token.created",
        target: { type: "access_token", id: created },
        metadata: { name, expiresAt: expiresAt?.toISOString() ?? null, via: input.via },
        ipAddress: actor.ip,
      },
      at,
    );
    return created;
  });
  return { token, id, name, expiresAt };
};

export const listTokens = async (
  deps: TokenDeps,
  actor: TokenActor,
): Promise<AccessTokenSummary[]> => {
  requirePermission(actor.user, "account.manage_own");
  return deps.repo.listForUser((actor.user as CurrentUser).id);
};

/** Revokes one of the actor's own tokens. Someone else's token is "not found", never "forbidden". */
export const revokeToken = async (
  deps: TokenDeps,
  actor: TokenActor,
  tokenId: string,
): Promise<void> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user as CurrentUser;
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    const token = await repo.findOwned(tokenId, user.id);
    if (!token) throw new TokenNotFoundError();
    if (token.revokedAt) return;
    await repo.revoke(tokenId, at);
    await repo.recordAudit(
      {
        actorId: user.id,
        action: "access_token.revoked",
        target: { type: "access_token", id: tokenId },
        metadata: { name: token.name, by: "owner" },
        ipAddress: actor.ip,
      },
      at,
    );
  });
};

/** A person's tokens for root, on their page (162): as their own list has them, without the preview. */
export const listTokensOf = async (
  deps: TokenDeps,
  actor: TokenActor,
  userId: string,
): Promise<Omit<AccessTokenSummary, "preview">[]> => {
  requirePermission(actor.user, "users.view");
  return (await deps.repo.listForUser(userId)).map(({ preview: _, ...token }) => token);
};

/**
 * Root revokes one of a person's tokens from their page (162), audited as `access_token.revoked`
 * by root. A token that isn't this person's is "not found"; one already revoked changes nothing.
 */
export const revokeTokenOf = async (
  deps: TokenDeps,
  actor: TokenActor,
  userId: string,
  tokenId: string,
): Promise<void> => {
  requirePermission(actor.user, "users.manage");
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    const token = await repo.findOwned(tokenId, userId);
    if (!token) throw new TokenNotFoundError();
    if (token.revokedAt) return;
    await repo.revoke(tokenId, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "access_token.revoked",
        target: { type: "access_token", id: tokenId },
        metadata: { name: token.name, by: "root" },
        ipAddress: actor.ip,
      },
      at,
    );
  });
};

export type TokenFailure =
  | "token_missing"
  | "token_invalid"
  | "token_expired"
  | "token_revoked"
  | "user_disabled";

export type Authenticated = {
  user: CurrentUser;
  token: { id: string; name: string; expiresAt: Date | null };
  /** The password root chose must be replaced first (128): the API refuses all but `/me`. */
  passwordChangeRequired: boolean;
};

/**
 * Checks a bearer token: the format first (no database work for junk), then the hash, the token's
 * state and its user. Updates `last_used_at` at most once a minute. Unknown and malformed tokens get
 * the same failure, so the answer doesn't reveal whether a token existed.
 */
const log = logger.child({ domain: "identity" });

/** A token that was sent and refused (feature 100): its reason, never the token. */
const rejected = (
  failure: Exclude<TokenFailure, "token_missing">,
): { ok: false; failure: TokenFailure } => {
  const reasons = {
    token_invalid: "unknown",
    token_revoked: "revoked",
    token_expired: "expired",
    user_disabled: "disabled",
  } as const;
  log.event("token.rejected", { reason: reasons[failure] });
  return { ok: false, failure };
};

export const authenticateToken = async (
  deps: TokenDeps,
  token: string | null,
): Promise<{ ok: true; value: Authenticated } | { ok: false; failure: TokenFailure }> => {
  // No token isn't a rejection: anonymous reads send none.
  if (token === null) return { ok: false, failure: "token_missing" };
  if (!isTokenFormat(token)) return rejected("token_invalid");
  const found = await deps.repo.findByHash(hashToken(token));
  if (!found) return rejected("token_invalid");
  const at = now(deps);
  if (found.token.revokedAt) return rejected("token_revoked");
  if (found.token.expiresAt && found.token.expiresAt.getTime() <= at.getTime())
    return rejected("token_expired");
  // An erased account (103) has no tokens left; the row refuses anyway.
  if (found.user.disabledAt || found.user.erasedAt) return rejected("user_disabled");

  await deps.repo.touchLastUsed(found.token.id, at);
  const { id, email, name, role, workspaces, personal } = found.user;
  return {
    ok: true,
    value: {
      user: { id, email, name, role, workspaces, personal },
      token: { id: found.token.id, name: found.token.name, expiresAt: found.token.expiresAt },
      passwordChangeRequired: Boolean(found.user.passwordChangeRequired),
    },
  };
};
