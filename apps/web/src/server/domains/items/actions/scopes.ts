import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import type { Viewer } from "../../workspaces/models/viewer";
import { kyselyScopeRepository } from "../repositories/kysely-scope-repository";
import type { ScopePageQuery } from "../repositories/scope-repository";
import * as service from "../services/scopes";

export type { ScopesPage } from "../services/scopes";

/**
 * Entry points for /admin/scopes (feature 010), and for 012's scope picker. Thin: they
 * find who's asking and wire the dependencies; the services check permissions.
 */
const deps = ({ db, dialect }: AppAuth, viewer: Viewer): service.ScopeDeps => ({
  repo: kyselyScopeRepository(db, dialect, viewer),
});

/** The dependencies, bound to what the person sees (093), and the actor: one lookup each. */
const bound = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  const actor: service.ScopeActor = { user, ip: clientIp(headers, app.trustProxy) };
  return [deps(app, await viewerOf(user, app)), actor] as const;
};

export const createScope = async (
  headers: Headers,
  input: { name: string; description: string; workspaceId?: string },
  app: AppAuth = getAppAuth(),
) => service.createScope(...(await bound(headers, app)), input);

export const updateScopeDescription = async (
  headers: Headers,
  input: { name: string; description: string },
  app: AppAuth = getAppAuth(),
) => service.updateScopeDescription(...(await bound(headers, app)), input);

export const listScopes = async (
  headers: Headers,
  query: { search?: string; cursor?: string },
  app: AppAuth = getAppAuth(),
) => service.listScopes(...(await bound(headers, app)), query);

/** The scope pages' table (061): sorted, paged with keyset cursors, and counted. */
export const pageScopes = async (
  headers: Headers,
  query: Partial<ScopePageQuery>,
  app: AppAuth = getAppAuth(),
) => service.pageScopes(...(await bound(headers, app)), query);

/** For 037's API, where the user comes from a bearer token rather than a session. */
export const listScopesAs = async (
  user: CurrentUser,
  query: { search?: string; cursor?: string; limit?: number },
  app: AppAuth = getAppAuth(),
) => service.listScopes(deps(app, await viewerOf(user, app)), { user, ip: null }, query);
