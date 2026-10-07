import { isValidName, normalizeWorkspaceName } from "@ronneai/core";
import { ForbiddenError } from "../../identity/exceptions/errors";
import {
  can,
  canInSome,
  requirePermission,
  workspacesWith,
} from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import {
  GlobalWorkspaceError,
  WorkspaceNameTakenError,
  WorkspaceNotEmptyError,
  WorkspaceNotFoundError,
  WorkspacesError,
} from "../exceptions/errors";
import {
  GLOBAL_WORKSPACE_NAME,
  type Workspace,
  workspaceDescriptionFrom,
  workspaceNameFrom,
  workspaceVisibilityFrom,
} from "../models/workspace";
import type { WorkspacePageQuery, WorkspaceRepository } from "../repositories/workspace-repository";

/**
 * Workspaces (feature 090). Root creates them, edits their descriptions and deletes empty ones;
 * everyone signed in lists them. `global` can't be edited or deleted. Names can't change yet.
 */
export type WorkspaceDeps = { repo: WorkspaceRepository; now?: () => Date };
export type WorkspaceActor = { user: CurrentUser | null; ip: string | null };

export const WORKSPACES_PAGE_SIZE = 50;
export const WORKSPACE_SEARCH_MAX_LENGTH = 100;

const now = (deps: WorkspaceDeps) => (deps.now ?? (() => new Date()))();

const audit = (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  action: "workspace.created" | "workspace.updated" | "workspace.deleted",
  id: string,
  metadata: Record<string, string | number>,
  at: Date,
) =>
  repo.recordAudit(
    {
      actorId: actor.user?.id ?? null,
      action,
      target: { type: "workspace", id },
      metadata,
      ipAddress: actor.ip,
    },
    at,
  );

/**
 * The workspace by name as create stores it, or null: trimmed and lowercased (so `ACME` finds
 * `acme`), checked against the name rule, and the row's name compared byte for byte, so a lookalike
 * such as `ａｃｍｅ` finds nothing on every database (MySQL's collation would otherwise match it).
 */
const byName = async (repo: WorkspaceRepository, value: string): Promise<Workspace | null> => {
  const name = normalizeWorkspaceName(value);
  if (!isValidName(name, "item")) return null;
  const workspace = await repo.findByName(name);
  return workspace?.name === name ? workspace : null;
};

/** The workspace by name, refused when it's missing or it's `global`. */
const changeable = async (repo: WorkspaceRepository, name: string): Promise<Workspace> => {
  const workspace = await byName(repo, name);
  if (!workspace) throw new WorkspaceNotFoundError();
  if (workspace.isGlobal) throw new GlobalWorkspaceError();
  return workspace;
};

export const createWorkspace = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { name: string; description: string; visibility?: string },
): Promise<Workspace> => {
  requirePermission(actor.user, "workspaces.manage");
  const name = workspaceNameFrom(input.name);
  const description = workspaceDescriptionFrom(input.description);
  const visibility = workspaceVisibilityFrom(input.visibility);
  const at = now(deps);
  try {
    return await deps.repo.transaction(async (repo) => {
      if (await repo.findByName(name)) throw new WorkspaceNameTakenError(name);
      const id = await repo.insert({
        name,
        description,
        visibility,
        createdBy: actor.user?.id ?? null,
        createdAt: at,
      });
      await audit(repo, actor, "workspace.created", id, { name, description, visibility }, at);
      return {
        id,
        name,
        description,
        visibility,
        isGlobal: false,
        scopes: 0,
        moderators: 0,
        createdBy: actor.user ? { id: actor.user.id, email: actor.user.email } : null,
        createdAt: at,
        updatedAt: at,
      };
    });
  } catch (error) {
    // Two roots creating the same name at once: the unique index refuses the second.
    if (!(error instanceof WorkspaceNameTakenError) && (await deps.repo.findByName(name)))
      throw new WorkspaceNameTakenError(name);
    throw error;
  }
};

export const updateWorkspace = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { name: string; description: string },
): Promise<void> => {
  // Root, or the workspace's admins (092); someone who edits none is refused first.
  if (!canInSome(actor.user, "workspace.edit")) throw new ForbiddenError("workspace.edit");
  const description = workspaceDescriptionFrom(input.description);
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    const workspace = await changeable(repo, input.name);
    requirePermission(actor.user, "workspace.edit", workspace.id);
    if (workspace.description === description) return;
    await repo.updateDescription(workspace.id, description, at);
    await audit(
      repo,
      actor,
      "workspace.updated",
      workspace.id,
      { name: workspace.name, from: workspace.description, to: description },
      at,
    );
  });
};

/** Only an empty workspace: its scopes would have nowhere to go (nothing moves scopes yet). */
export const deleteWorkspace = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { name: string },
): Promise<void> => {
  requirePermission(actor.user, "workspaces.manage");
  const at = now(deps);
  try {
    await deps.repo.transaction(async (repo) => {
      const workspace = await changeable(repo, input.name);
      if (workspace.scopes > 0) throw new WorkspaceNotEmptyError(workspace.scopes);
      // Its memberships go with it (they cascade); the event says how many (092).
      const members = await repo.countMembers(workspace.id);
      await repo.delete(workspace.id);
      await audit(
        repo,
        actor,
        "workspace.deleted",
        workspace.id,
        { name: workspace.name, members },
        at,
      );
    });
  } catch (error) {
    // A scope created in it after the count: its foreign key refuses the delete.
    if (!(error instanceof WorkspacesError)) {
      const workspace = await byName(deps.repo, input.name);
      if (workspace && workspace.scopes > 0) throw new WorkspaceNotEmptyError(workspace.scopes);
    }
    throw error;
  }
};

/** Every workspace, `global` first: everyone signed in, for the catalogue's filter and the selects. */
export const listWorkspaces = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
): Promise<Workspace[]> => {
  requirePermission(actor.user, "account.manage_own");
  return deps.repo.list();
};

export type WorkspacesTablePage = {
  workspaces: Workspace[];
  next: string | null;
  previous: string | null;
  total: { count: number; capped: boolean };
};

/**
 * One page of Admin › Workspaces, and the capped count of all that match. Root sees every
 * workspace; an admin only those they administer (092). `global` comes first, on
 * the first page, whatever the sort, when the search matches it.
 */
export const pageWorkspaces = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  query: Partial<WorkspacePageQuery>,
): Promise<WorkspacesTablePage> => {
  if (!canInSome(actor.user, "members.manage")) throw new ForbiddenError("members.manage");
  const where = workspacesWith(actor.user, "members.manage");
  const ids = where === "all" ? undefined : where;
  const search = query.search?.trim().slice(0, WORKSPACE_SEARCH_MAX_LENGTH) || undefined;
  const sort = query.sort ?? "name";
  const [page, total] = await Promise.all([
    deps.repo.page({
      search,
      sort,
      dir: query.dir ?? (sort === "name" ? "asc" : "desc"),
      size: query.size ?? WORKSPACES_PAGE_SIZE,
      cursor: query.cursor,
      ids,
    }),
    deps.repo.count(search, ids),
  ]);
  // `global` counts whenever the search matches it, on every page, and is listed first on the first
  // page (no page before it, however it was reached).
  const found = await deps.repo.findByName(GLOBAL_WORKSPACE_NAME);
  const term = search?.toLowerCase();
  const global =
    found &&
    (!ids || ids.includes(found.id)) &&
    (!term || found.name.includes(term) || found.description.toLowerCase().includes(term))
      ? found
      : null;
  return {
    workspaces: global && page.previous === null ? [global, ...page.rows] : page.rows,
    next: page.next,
    previous: page.previous,
    total: { count: total.count + (global ? 1 : 0), capped: total.capped },
  };
};

/** One workspace, for its page in Admin › Workspaces: root, or one of its admins (092); null otherwise. */
export const findWorkspace = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  name: string,
): Promise<Workspace | null> => {
  if (!canInSome(actor.user, "members.manage")) throw new ForbiddenError("members.manage");
  const workspace = await byName(deps.repo, name);
  return workspace && can(actor.user, "members.manage", workspace.id) ? workspace : null;
};
