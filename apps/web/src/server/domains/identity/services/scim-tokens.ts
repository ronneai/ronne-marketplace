import {
  NoScimTokenError,
  ProviderNotFoundError,
  ScimOffError,
  ScimTokenExistsError,
} from "../exceptions/errors";
import { requirePermission } from "../models/permissions";
import {
  generateScimToken,
  hashScimToken,
  isScimTokenFormat,
  SCIM_ROTATION_OVERLAP_MS,
  type ScimTokenSummary,
  scimTokenWorks,
} from "../models/scim-token";
import type { CurrentUser } from "../models/user";
import type { ScimTokenRepository } from "../repositories/scim-token-repository";

/**
 * SCIM on an identity provider (feature 108): root turns it on, and makes, rotates and revokes the
 * one bearer token the provider sends. Every change and its 007 event share a transaction, with the
 * provider's row locked. The plain token only ever exists in the result of `createScimToken` and
 * `rotateScimToken`; events and logs never hold it.
 */
export type ScimTokenDeps = { repo: ScimTokenRepository; now?: () => Date };

export type ScimActor = { user: CurrentUser | null; ip: string | null };

export type ScimStatus = { enabledAt: Date | null; tokens: ScimTokenSummary[] };

const now = (deps: ScimTokenDeps) => (deps.now ?? (() => new Date()))();

const event = (
  actor: ScimActor,
  action:
    | "instance.scim_enabled"
    | "instance.scim_disabled"
    | "instance.scim_token_created"
    | "instance.scim_token_rotated"
    | "instance.scim_token_revoked",
  provider: string,
  extra: Record<string, number> = {},
) => ({
  actorId: actor.user?.id ?? null,
  action,
  target: { type: "instance" as const },
  metadata: { provider, ...extra },
  ipAddress: actor.ip,
});

const lock = async (repo: ScimTokenRepository, providerId: string) => {
  const provider = await repo.lockProvider(providerId);
  if (!provider) throw new ProviderNotFoundError();
  return provider;
};

/** Whether SCIM is on, and the tokens that still work, for the provider's SCIM section. */
export const scimStatus = async (
  deps: ScimTokenDeps,
  actor: ScimActor,
  providerId: string,
): Promise<ScimStatus> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const { scimEnabledAt } = await lock(repo, providerId);
    return { enabledAt: scimEnabledAt, tokens: await repo.listWorking(providerId, at) };
  });
};

export const enableScim = async (
  deps: ScimTokenDeps,
  actor: ScimActor,
  providerId: string,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const { scimEnabledAt } = await lock(repo, providerId);
    if (scimEnabledAt) return { changed: false };
    await repo.setScimEnabled(providerId, at);
    await repo.recordAudit(event(actor, "instance.scim_enabled", providerId), at);
    return { changed: true };
  });
};

/** Turns SCIM off: every request is refused. The token stays, for when it's turned on again. */
export const disableScim = async (
  deps: ScimTokenDeps,
  actor: ScimActor,
  providerId: string,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const { scimEnabledAt } = await lock(repo, providerId);
    if (!scimEnabledAt) return { changed: false };
    await repo.setScimEnabled(providerId, null);
    await repo.recordAudit(event(actor, "instance.scim_disabled", providerId), at);
    return { changed: true };
  });
};

/** The provider's first token, or its next after Revoke. Shown once. */
export const createScimToken = async (
  deps: ScimTokenDeps,
  actor: ScimActor,
  providerId: string,
): Promise<{ token: string; id: string }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  const token = generateScimToken();
  return deps.repo.transaction(async (repo) => {
    const { scimEnabledAt } = await lock(repo, providerId);
    if (!scimEnabledAt) throw new ScimOffError();
    if ((await repo.listWorking(providerId, at)).some((t) => t.expiresAt === null))
      throw new ScimTokenExistsError();
    const id = await repo.insert({
      providerId,
      tokenHash: hashScimToken(token),
      createdBy: actor.user?.id ?? null,
      createdAt: at,
    });
    await repo.recordAudit(event(actor, "instance.scim_token_created", providerId), at);
    return { token, id };
  });
};

/**
 * A new token; the current one keeps working for 24 hours. A token still within an earlier
 * rotation's 24 hours stops now, so at most two ever work.
 */
export const rotateScimToken = async (
  deps: ScimTokenDeps,
  actor: ScimActor,
  providerId: string,
): Promise<{ token: string; id: string; previousExpiresAt: Date }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  const token = generateScimToken();
  return deps.repo.transaction(async (repo) => {
    const { scimEnabledAt } = await lock(repo, providerId);
    if (!scimEnabledAt) throw new ScimOffError();
    const working = await repo.listWorking(providerId, at);
    const current = working.find((t) => t.expiresAt === null);
    if (!current) throw new NoScimTokenError();
    await repo.revoke(
      working.filter((t) => t.id !== current.id).map((t) => t.id),
      at,
    );
    const previousExpiresAt = new Date(at.getTime() + SCIM_ROTATION_OVERLAP_MS);
    await repo.setExpiry(current.id, previousExpiresAt);
    const id = await repo.insert({
      providerId,
      tokenHash: hashScimToken(token),
      createdBy: actor.user?.id ?? null,
      createdAt: at,
    });
    await repo.recordAudit(event(actor, "instance.scim_token_rotated", providerId), at);
    return { token, id, previousExpiresAt };
  });
};

/** Stops every token of the provider at once, the one before a rotation too. */
export const revokeScimTokens = async (
  deps: ScimTokenDeps,
  actor: ScimActor,
  providerId: string,
): Promise<{ revoked: number }> => {
  requirePermission(actor.user, "settings.manage");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    await lock(repo, providerId);
    const working = await repo.listWorking(providerId, at);
    const revoked = await repo.revoke(
      working.map((t) => t.id),
      at,
    );
    if (revoked > 0)
      await repo.recordAudit(
        event(actor, "instance.scim_token_revoked", providerId, { tokens: revoked }),
        at,
      );
    return { revoked };
  });
};

export type ScimTokenCheck =
  | { ok: true; providerId: string; tokenId: string }
  | { ok: false; reason: "format" | "unknown" | "revoked" | "expired" | "scim_off" };

/**
 * Who a bearer token is: the provider, if the token works and SCIM is on for it. Records when it
 * was last used (at most once a minute). For the SCIM guard (task 3), which answers every refusal
 * the same way.
 */
export const checkScimToken = async (
  deps: ScimTokenDeps,
  token: string,
): Promise<ScimTokenCheck> => {
  if (!isScimTokenFormat(token)) return { ok: false, reason: "format" };
  const at = now(deps);
  const match = await deps.repo.findByHash(hashScimToken(token));
  if (!match) return { ok: false, reason: "unknown" };
  if (match.revokedAt) return { ok: false, reason: "revoked" };
  if (!scimTokenWorks(match, at)) return { ok: false, reason: "expired" };
  if (!match.scimEnabledAt) return { ok: false, reason: "scim_off" };
  await deps.repo.touchLastUsed(match.tokenId, at);
  return { ok: true, providerId: match.providerId, tokenId: match.tokenId };
};
