import { ForbiddenError } from "../../identity/exceptions/errors";
import {
  can,
  canInSome,
  requirePermission,
  workspacesWith,
} from "../../identity/models/permissions";
import type { CurrentUser, WorkspaceRole } from "../../identity/models/user";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import {
  ScopeNameTakenError,
  ScopeNotFoundError,
  ScopeWorkspaceNotFoundError,
} from "../exceptions/errors";
import { type Scope, scopeDescriptionFrom, scopeNameFrom } from "../models/scope";
import type { ScopePageQuery, ScopeRepository } from "../repositories/scope-repository";

/**
 * Scopes (feature 010). Root creates them, each in a workspace (090, `global` unless another is
 * chosen), and edits their descriptions; everyone signed in lists them. Names can't change and scopes can't be deleted: items and installs depend on the name.
 */
export type ScopeDeps = { repo: ScopeRepository; now?: () => Date };
export type ScopeActor = { user: CurrentUser | null; ip: string | null };

export const SCOPES_PAGE_SIZE = 50;
export const SCOPE_SEARCH_MAX_LENGTH = 100;

const now = (deps: ScopeDeps) => (deps.now ?? (() => new Date()))();

/**
 * Who creates scopes and edits their descriptions: root, anywhere (`scopes.manage`), and a
 * workspace's admins, in it (`scopes.create`, 092). Anyone else is refused before any lookup.
 */
const requireScopeManagerSomewhere = (actor: ScopeActor) => {
  if (!can(actor.user, "scopes.manage") && !canInSome(actor.user, "scopes.create"))
    throw new ForbiddenError("scopes.manage");
};

const requireScopeManagerIn = (actor: ScopeActor, workspaceId: string) => {
  if (!can(actor.user, "scopes.manage"))
    requirePermission(actor.user, "scopes.create", workspaceId);
};

export const createScope = async (
  deps: ScopeDeps,
  actor: ScopeActor,
  input: { name: string; description: string; workspaceId?: string },
): Promise<Scope> => {
  requireScopeManagerSomewhere(actor);
  const name = scopeNameFrom(input.name);
  const description = scopeDescriptionFrom(input.description);
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const workspace = await repo.findWorkspace(input.workspaceId || GLOBAL_WORKSPACE_ID);
    if (!workspace) throw new ScopeWorkspaceNotFoundError();
    requireScopeManagerIn(actor, workspace.id);
    if (await repo.findByName(name)) throw new ScopeNameTakenError(name);
    const id = await repo.insert({
      name,
      description,
      workspaceId: workspace.id,
      createdBy: actor.user?.id ?? null,
      createdAt: at,
    });
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "scope.created",
        target: { type: "scope", id },
        metadata: { name, description, workspace: workspace.name },
        ipAddress: actor.ip,
      },
      at,
    );
    return {
      id,
      name,
      description,
      workspace,
      createdBy: actor.user ? { id: actor.user.id, email: actor.user.email } : null,
      createdAt: at,
    };
  });
};

export const updateScopeDescription = async (
  deps: ScopeDeps,
  actor: ScopeActor,
  input: { name: string; description: string },
): Promise<void> => {
  requireScopeManagerSomewhere(actor);
  const description = scopeDescriptionFrom(input.description);
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    const scope = await repo.findByName(input.name);
    if (!scope) throw new ScopeNotFoundError();
    requireScopeManagerIn(actor, scope.workspace.id);
    if (scope.description === description) return;
    await repo.updateDescription(scope.id, description);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "scope.updated",
        target: { type: "scope", id: scope.id },
        metadata: { name: scope.name, from: scope.description, to: description },
        ipAddress: actor.ip,
      },
      at,
    );
  });
};

export type ScopesPage = { scopes: (Scope & { role: ScopeRole })[]; nextCursor: string | null };

/** The actor's role where a scope is: root, or their role in its workspace (091). */
export type ScopeRole = "root" | WorkspaceRole;

/**
 * The scopes the actor's items can go in: those of the workspaces they're a member of (091), every
 * one for root, each with the actor's role there. The new draft form and `GET /api/v1/scopes`
 * (`rmk export`) list these. The admin pages use pageScopes; the API (037) passes its own `limit`.
 */
export const listScopes = async (
  deps: ScopeDeps,
  actor: ScopeActor,
  query: { search?: string; cursor?: string; limit?: number },
): Promise<ScopesPage> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user as CurrentUser;
  const where = workspacesWith(user, "submissions.create");
  const search = query.search?.trim().slice(0, SCOPE_SEARCH_MAX_LENGTH) || undefined;
  const size = query.limit ?? SCOPES_PAGE_SIZE;
  const rows = await deps.repo.list({
    search,
    cursor: query.cursor,
    limit: size + 1,
    ...(where === "all" ? {} : { workspaceIds: where }),
  });
  const scopes = rows.slice(0, size).map((scope) => ({
    ...scope,
    role:
      user.role === "root" ? ("root" as const) : (user.workspaces[scope.workspace.id] ?? "user"),
  }));
  return {
    scopes,
    nextCursor: rows.length > size ? (scopes.at(-1)?.name ?? null) : null,
  };
};

export type ScopesTablePage = {
  scopes: Scope[];
  next: string | null;
  previous: string | null;
  total: { count: number; capped: boolean };
};

/** One page of scopes for the web tables, and the capped count of all that match (061). */
export const pageScopes = async (
  deps: ScopeDeps,
  actor: ScopeActor,
  query: Partial<ScopePageQuery>,
): Promise<ScopesTablePage> => {
  requirePermission(actor.user, "account.manage_own");
  const search = query.search?.trim().slice(0, SCOPE_SEARCH_MAX_LENGTH) || undefined;
  const sort = query.sort ?? "name";
  const [page, total] = await Promise.all([
    deps.repo.page({
      search,
      workspaceId: query.workspaceId,
      sort,
      dir: query.dir ?? (sort === "name" ? "asc" : "desc"),
      size: query.size ?? SCOPES_PAGE_SIZE,
      cursor: query.cursor,
    }),
    deps.repo.count({ search, workspaceId: query.workspaceId }),
  ]);
  return { scopes: page.rows, next: page.next, previous: page.previous, total };
};
