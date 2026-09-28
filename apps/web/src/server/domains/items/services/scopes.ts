import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import { ScopeNameTakenError, ScopeNotFoundError } from "../exceptions/errors";
import { type Scope, scopeDescriptionFrom, scopeNameFrom } from "../models/scope";
import type { ScopeRepository } from "../repositories/scope-repository";

/**
 * Scopes (feature 010). Root creates them and edits their descriptions; everyone signed in lists
 * them. Names can't change and scopes can't be deleted: items and installs depend on the name.
 */
export type ScopeDeps = { repo: ScopeRepository; now?: () => Date };
export type ScopeActor = { user: CurrentUser | null; ip: string | null };

export const SCOPES_PAGE_SIZE = 50;
export const SCOPE_SEARCH_MAX_LENGTH = 100;

const now = (deps: ScopeDeps) => (deps.now ?? (() => new Date()))();

export const createScope = async (
  deps: ScopeDeps,
  actor: ScopeActor,
  input: { name: string; description: string },
): Promise<Scope> => {
  requirePermission(actor.user, "scopes.manage");
  const name = scopeNameFrom(input.name);
  const description = scopeDescriptionFrom(input.description);
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    if (await repo.findByName(name)) throw new ScopeNameTakenError(name);
    const id = await repo.insert({
      name,
      description,
      createdBy: actor.user?.id ?? null,
      createdAt: at,
    });
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "scope.created",
        target: { type: "scope", id },
        metadata: { name, description },
        ipAddress: actor.ip,
      },
      at,
    );
    return {
      id,
      name,
      description,
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

/** Everyone signed in can list scopes: they need them to know where their items can go. */
export const listScopes = async (
  deps: ScopeDeps,
  actor: ScopeActor,
  query: { search?: string; cursor?: string },
): Promise<ScopesPage> => {
  requirePermission(actor.user, "account.manage_own");
  const search = query.search?.trim().slice(0, SCOPE_SEARCH_MAX_LENGTH) || undefined;
  const rows = await deps.repo.list({ search, cursor: query.cursor, limit: SCOPES_PAGE_SIZE + 1 });
  const scopes = rows.slice(0, SCOPES_PAGE_SIZE);
  return {
    scopes,
    nextCursor: rows.length > SCOPES_PAGE_SIZE ? (scopes.at(-1)?.name ?? null) : null,
  };
};

export const findScope = async (deps: ScopeDeps, name: string): Promise<Scope | null> =>
  deps.repo.findByName(name);
