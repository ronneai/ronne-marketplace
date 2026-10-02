import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyScopeRepository } from "../repositories/kysely-scope-repository";
import type { ScopePageQuery } from "../repositories/scope-repository";
import * as service from "../services/scopes";

export type { ScopesPage } from "../services/scopes";

/**
 * Entry points for /scopes and /admin/scopes (feature 010), and for 012's scope picker. Thin: they
 * find who's asking and wire the dependencies; the services check permissions.
 */
const deps = ({ db, dialect }: AppAuth): service.ScopeDeps => ({
  repo: kyselyScopeRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth): Promise<service.ScopeActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export const createScope = async (
  headers: Headers,
  input: { name: string; description: string },
  app: AppAuth = getAppAuth(),
) => service.createScope(deps(app), await actor(headers, app), input);

export const updateScopeDescription = async (
  headers: Headers,
  input: { name: string; description: string },
  app: AppAuth = getAppAuth(),
) => service.updateScopeDescription(deps(app), await actor(headers, app), input);

export const listScopes = async (
  headers: Headers,
  query: { search?: string; cursor?: string },
  app: AppAuth = getAppAuth(),
) => service.listScopes(deps(app), await actor(headers, app), query);

/** The scope pages' table (061): sorted, paged with keyset cursors, and counted. */
export const pageScopes = async (
  headers: Headers,
  query: Partial<ScopePageQuery>,
  app: AppAuth = getAppAuth(),
) => service.pageScopes(deps(app), await actor(headers, app), query);

/** For 037's API, where the user comes from a bearer token rather than a session. */
export const listScopesAs = (
  user: CurrentUser,
  query: { search?: string; cursor?: string; limit?: number },
  app: AppAuth = getAppAuth(),
) => service.listScopes(deps(app), { user, ip: null }, query);

/** For 012 and 013's checks: the scope, or null. */
export const findScope = (name: string, app: AppAuth = getAppAuth()) =>
  service.findScope(deps(app), name);
