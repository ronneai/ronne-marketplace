import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
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

export const createScope = async (
  deps: ScopeDeps,
  actor: ScopeActor,
  input: { name: string; description: string; workspaceId?: string },
): Promise<Scope> => {
  requirePermission(actor.user, "scopes.manage");
  const name = scopeNameFrom(input.name);
  const description = scopeDescriptionFrom(input.description);
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const workspace = await repo.findWorkspace(input.workspaceId || GLOBAL_WORKSPACE_ID);
    if (!workspace) throw new ScopeWorkspaceNotFoundError();
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
  requirePermission(actor.user, "scopes.manage");
  const description = scopeDescriptionFrom(input.description);
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    const scope = await repo.findByName(input.name);
    if (!scope) throw new ScopeNotFoundError();
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

export type ScopesPage = { scopes: Scope[]; nextCursor: string | null };

/**
 * Everyone signed in can list scopes: they need them to know where their items can go. The admin page
 * uses SCOPES_PAGE_SIZE; the API (037) passes its own `limit`.
 */
export const listScopes = async (
  deps: ScopeDeps,
  actor: ScopeActor,
  query: { search?: string; cursor?: string; limit?: number },
): Promise<ScopesPage> => {
  requirePermission(actor.user, "account.manage_own");
  const search = query.search?.trim().slice(0, SCOPE_SEARCH_MAX_LENGTH) || undefined;
  const size = query.limit ?? SCOPES_PAGE_SIZE;
  const rows = await deps.repo.list({ search, cursor: query.cursor, limit: size + 1 });
  const scopes = rows.slice(0, size);
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

export const findScope = async (deps: ScopeDeps, name: string): Promise<Scope | null> =>
  deps.repo.findByName(name);
