import { clientIp } from "../models/client-ip";
import { requirePermission } from "../models/permissions";
import type { ScimAccountState } from "../models/scim-user";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselyScimTokenRepository } from "../repositories/kysely-scim-token-repository";
import { kyselyScimUserRepository } from "../repositories/kysely-scim-user-repository";
import * as tokens from "../services/scim-tokens";
import { getCurrentUser } from "./session";

/**
 * The provider page's SCIM section (feature 108): thin adapters over the token service for
 * Admin › Settings › Authentication, and each account's SCIM state for Admin › Users. Root only,
 * checked by the service (and here for the reads that skip it).
 */
const deps = (app: AppAuth): tokens.ScimTokenDeps => ({
  repo: kyselyScimTokenRepository(app.db, app.dialect),
});

const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** A token as the section lists it: who made it, by email when they still exist. */
export type ScimTokenRow = {
  id: string;
  createdAt: Date;
  createdBy: string | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
};

export type ScimPanel = {
  /** When SCIM was turned on; null while it's off. */
  enabledAt: Date | null;
  /** `<PUBLIC_URL>/api/v1/scim/v2`, what the provider is given. */
  base: string;
  tokens: ScimTokenRow[];
};

export const scimPanel = async (
  headers: Headers,
  providerId: string,
  app: AppAuth = getAppAuth(),
): Promise<ScimPanel> => {
  const status = await tokens.scimStatus(deps(app), await actor(headers, app), providerId);
  const identity = kyselyIdentityRepository(app.db, app.dialect);
  const emails = new Map<string, string>();
  for (const token of status.tokens)
    if (token.createdBy && !emails.has(token.createdBy)) {
      const user = await identity.findUser(token.createdBy);
      if (user) emails.set(token.createdBy, user.email);
    }
  const origin = String((await app.auth.$context).options.baseURL ?? "http://localhost:3000");
  return {
    enabledAt: status.enabledAt,
    base: `${origin.replace(/\/+$/, "")}/api/v1/scim/v2`,
    tokens: status.tokens.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      createdBy: t.createdBy ? (emails.get(t.createdBy) ?? null) : null,
      expiresAt: t.expiresAt,
      lastUsedAt: t.lastUsedAt,
    })),
  };
};

export const turnOnScim = async (headers: Headers, providerId: string, app = getAppAuth()) =>
  tokens.enableScim(deps(app), await actor(headers, app), providerId);

export const turnOffScim = async (headers: Headers, providerId: string, app = getAppAuth()) =>
  tokens.disableScim(deps(app), await actor(headers, app), providerId);

export const generateScimToken = async (headers: Headers, providerId: string, app = getAppAuth()) =>
  tokens.createScimToken(deps(app), await actor(headers, app), providerId);

export const rotateScimToken = async (headers: Headers, providerId: string, app = getAppAuth()) =>
  tokens.rotateScimToken(deps(app), await actor(headers, app), providerId);

export const revokeScimToken = async (headers: Headers, providerId: string, app = getAppAuth()) =>
  tokens.revokeScimTokens(deps(app), await actor(headers, app), providerId);

/** Each account's SCIM state, for Admin › Users' badges (root's `users.view`). */
export const scimAccountStates = async (
  headers: Headers,
  userIds: string[],
  app: AppAuth = getAppAuth(),
): Promise<Map<string, ScimAccountState>> => {
  requirePermission(await getCurrentUser(headers, app), "users.view");
  return kyselyScimUserRepository(app.db, app.dialect).accountStates(userIds);
};
