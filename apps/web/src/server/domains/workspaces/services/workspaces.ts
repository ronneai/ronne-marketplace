import {
  formatItemName,
  isValidName,
  normalizeWorkspaceName,
  parseItemName,
  parseManifest,
} from "@ronneai/core";
import { ForbiddenError } from "../../identity/exceptions/errors";
import {
  can,
  canInSome,
  requirePermission,
  workspacesWith,
} from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import { renamedFrontmatterAgent, renamedManifest } from "../../submissions/models/manifest-names";
import {
  GlobalWorkspaceError,
  PersonalWorkspaceError,
  WorkspaceHasOutsideDependentsError,
  WorkspaceNameTakenError,
  WorkspaceNotEmptyError,
  WorkspaceNotFoundError,
  WorkspaceRenameAliasError,
  WorkspacesError,
} from "../exceptions/errors";
import { seesWorkspace, visibleWorkspaces } from "../models/viewer";
import {
  GLOBAL_WORKSPACE_NAME,
  visibilityChoice,
  type Workspace,
  workspaceDescriptionFrom,
  workspaceNameFrom,
  workspaceVisibilityFrom,
} from "../models/workspace";
import type { WorkspacePageQuery, WorkspaceRepository } from "../repositories/workspace-repository";

/**
 * Workspaces (feature 090). Root creates them, edits their descriptions and deletes empty ones;
 * everyone signed in lists them. `global` can't be edited or deleted. Root and a workspace's admins
 * rename it (113).
 */
export type WorkspaceDeps = { repo: WorkspaceRepository; now?: () => Date };
export type WorkspaceActor = { user: CurrentUser | null; ip: string | null };

export const WORKSPACES_PAGE_SIZE = 50;
export const WORKSPACE_SEARCH_MAX_LENGTH = 100;

const now = (deps: WorkspaceDeps) => (deps.now ?? (() => new Date()))();

const audit = (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  action: "workspace.created" | "workspace.updated" | "workspace.renamed" | "workspace.deleted",
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
      // Open requests to the name, made before it existed, are now this workspace's (094).
      await repo.attachRequests(name, id);
      return {
        id,
        name,
        description,
        visibility,
        isGlobal: false,
        ownerId: null,
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
    // Locked, then read again by name, as delete does: renamed meanwhile (113), it's gone.
    await repo.lockWorkspace((await changeable(repo, input.name)).id);
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

/**
 * Renames a workspace (113): root, or its admins; never `global`. The name follows create's rule
 * and must be free; its items take the new name, every old one an alias (118), so installs,
 * lockfiles and dependencies keep working. Open requests kept for the new name join it, as when a
 * workspace is created with it (094). No redirect from the old name: it answers as unknown.
 */
export const renameWorkspace = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { name: string; to: string },
): Promise<Workspace> => {
  // Root, or the workspace's admins; someone who renames none is refused first.
  if (!canInSome(actor.user, "workspace.rename")) throw new ForbiddenError("workspace.rename");
  const to = workspaceNameFrom(input.to);
  const at = now(deps);
  try {
    return await deps.repo.transaction(async (repo) => {
      const found = await changeable(repo, input.name);
      requirePermission(actor.user, "workspace.rename", found.id);
      // Its scopes and open submissions (a submit's and a save's locks), its items, then its row (a
      // release's order), then read again: a release that made an item under the old name has
      // committed, and two renames at once run one after the other.
      await repo.lockOpenWorkIn(found.id);
      await repo.lockItemsIn(found.id);
      await repo.lockWorkspace(found.id);
      const workspace = await repo.findById(found.id);
      // Gone, or renamed by someone else meanwhile: the name asked for answers as unknown now.
      if (!workspace || workspace.name !== found.name) throw new WorkspaceNotFoundError();
      if (workspace.name === to) return workspace;
      // Taken by another workspace: the unique index decides too, when two renames race.
      if (await repo.findByName(to)) throw new WorkspaceNameTakenError(to);

      const items = await repo.itemsIn(workspace.id);
      const named = (workspaceName: string, item: { scope: string; name: string }) =>
        formatItemName({ workspace: workspaceName, scope: item.scope, name: item.name });
      const ids = new Set(items.map((item) => item.id));
      const newNames = items.map((item) => named(to, item));
      // A new name that's another item's old name stays that item's (118).
      const aliases = await repo.aliasesNamed(newNames);
      const others = aliases.filter((alias) => !ids.has(alias.itemId));
      if (others.length > 0) {
        // Named only when the renamer sees the item: someone's personal workspace's (114), or any
        // private one's they're not in, is counted, never named.
        const where = await repo.itemWorkspaces(others.map((alias) => alias.itemId));
        const user = actor.user;
        const seen = (itemId: string) => {
          const w = where.get(itemId);
          return (
            user?.role === "root" ||
            (w !== undefined &&
              (w.visibility === "public" || Object.hasOwn(user?.workspaces ?? {}, w.workspaceId)))
          );
        };
        const named = others.filter((a) => seen(a.itemId)).map((a) => a.name);
        throw new WorkspaceRenameAliasError([...named].sort(), others.length - named.length);
      }

      await repo.rename(workspace.id, to, at);
      // Drafts and submissions not released yet name the workspace's items by their old names:
      // their own `name`, their dependencies, a skill's agent. Written under the new ones, they
      // submit and release as before (`@acme/…` becomes `@acme-platform/…`, nothing else).
      const renamed = (name: string) => {
        const parts = parseItemName(name);
        return parts && parts.workspace === workspace.name ? named(to, parts) : null;
      };
      const manifests = await repo.openManifestsIn(workspace.id);
      const entries = await repo.openFiles(
        manifests.flatMap((file) => {
          const manifest = parseManifest(file.content).manifest;
          if (manifest?.type !== "skill") return [];
          const skill = (manifest.skill ?? {}) as Record<string, unknown>;
          const { content: _, ...where } = file;
          return [{ ...where, path: String(skill.entry ?? "SKILL.md") }];
        }),
      );
      const changed = [
        ...manifests.map((file) => ({ ...file, after: renamedManifest(file.content, renamed) })),
        ...entries.map((file) => ({
          ...file,
          after: renamedFrontmatterAgent(file.content, renamed),
        })),
      ].flatMap(({ after, ...file }) =>
        after === file.content ? [] : [{ ...file, content: after }],
      );
      await repo.writeFiles(changed, at);
      // Its items' names now: old names of their own no more (a rename back); the ones they had,
      // old names from now on.
      await repo.setAliases(
        items.map((item) => ({ name: named(workspace.name, item), itemId: item.id })),
        aliases.map((alias) => alias.name),
        "rename",
        at,
      );
      // Nobody joins a personal workspace (114): requests kept for its new name stay by name.
      const requestsJoined = workspace.ownerId
        ? 0
        : await repo.joinRequestsOnRename(workspace.id, to, at);
      await audit(
        repo,
        actor,
        "workspace.renamed",
        workspace.id,
        { from: workspace.name, to, items: items.length, requestsJoined },
        at,
      );
      return { ...workspace, name: to, updatedAt: at };
    });
  } catch (error) {
    // Another workspace took the name between the check and the update: the unique index refused it.
    if (!(error instanceof WorkspacesError) && !(error instanceof ForbiddenError)) {
      const holder = await deps.repo.findByName(to);
      const renamed = await byName(deps.repo, input.name);
      if (holder && holder.id !== renamed?.id) throw new WorkspaceNameTakenError(to);
    }
    throw error;
  }
};

/** What a rename would change (113), for its dialog: how many items take the new name. */
export const renameImpact = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  name: string,
): Promise<{ items: number }> => {
  if (!canInSome(actor.user, "workspace.rename")) throw new ForbiddenError("workspace.rename");
  const workspace = await changeable(deps.repo, name);
  requirePermission(actor.user, "workspace.rename", workspace.id);
  return { items: (await deps.repo.itemsIn(workspace.id)).length };
};

/**
 * What turning a workspace private would meet (093): the released items outside it that depend on
 * its items, which refuse it, and the open submissions outside it that do, which would fail at
 * release. Both by name. Nothing for a workspace that's private already.
 */
export type VisibilityImpact = { dependents: string[]; openDependents: string[] };

const impactOf = async (
  repo: WorkspaceRepository,
  workspace: Workspace,
): Promise<VisibilityImpact> => {
  const scopes = new Set(await repo.scopeNames(workspace.id));
  const openDependents = (await repo.openSubmissionsOutside(workspace.id))
    .filter(({ manifest }) => {
      const dependencies = manifest ? (parseManifest(manifest).manifest?.dependencies ?? {}) : {};
      return Object.keys(dependencies).some((name) => {
        const parsed = parseItemName(name);
        return parsed !== null && scopes.has(parsed.scope);
      });
    })
    .map(({ name }) => name);
  return {
    dependents: (await repo.outsideDependents(workspace.id)).map((d) => d.name),
    openDependents,
  };
};

/** Root only, like the setting itself: what Make private would meet, for its dialog. */
export const visibilityImpact = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  name: string,
): Promise<VisibilityImpact> => {
  requirePermission(actor.user, "workspaces.manage");
  const workspace = await changeable(deps.repo, name);
  if (workspace.ownerId) throw new PersonalWorkspaceError("visibility");
  if (workspace.visibility === "private") return { dependents: [], openDependents: [] };
  return impactOf(deps.repo, workspace);
};

/**
 * Makes a workspace private or public (093), root only; `global` stays public. Turning private is
 * refused while released items outside it depend on its items. Either way the catalogue revision
 * rises, so plugin feeds rebuild, and the change is audited.
 */
export const setWorkspaceVisibility = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { name: string; visibility: string },
): Promise<void> => {
  requirePermission(actor.user, "workspaces.manage");
  const to = visibilityChoice(input.visibility);
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    // Locked, then read again: a release that checks its dependencies takes the same lock (093),
    // and two roots changing it at once change it once.
    await repo.lockWorkspace((await changeable(repo, input.name)).id);
    const workspace = await changeable(repo, input.name);
    // Always private (114), whichever way it's asked.
    if (workspace.ownerId) throw new PersonalWorkspaceError("visibility");
    if (workspace.visibility === to) return;
    if (to === "private") {
      const dependents = (await repo.outsideDependents(workspace.id)).map((d) => d.name);
      if (dependents.length > 0)
        throw new WorkspaceHasOutsideDependentsError(workspace.name, dependents);
    }
    await repo.setVisibility(workspace.id, to, at);
    await audit(
      repo,
      actor,
      "workspace.updated",
      workspace.id,
      { name: workspace.name, visibility: to, from: workspace.visibility },
      at,
    );
  });
};

/**
 * Only an empty workspace: move its scopes out first (115). Its memberships and the open moves into
 * it go with it (they cascade).
 */
export const deleteWorkspace = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { name: string },
): Promise<void> => {
  requirePermission(actor.user, "workspaces.manage");
  const at = now(deps);
  try {
    await deps.repo.transaction(async (repo) => {
      // Locked, then read again by name: renamed meanwhile (113), the name asked for is gone.
      await repo.lockWorkspace((await changeable(repo, input.name)).id);
      const workspace = await changeable(repo, input.name);
      if (workspace.ownerId) throw new PersonalWorkspaceError("delete");
      if (workspace.scopes > 0) throw new WorkspaceNotEmptyError(workspace.scopes);
      // Its memberships go with it (they cascade); the event says how many (092).
      const members = await repo.countMembers(workspace.id);
      // And the requests to move a scope into it (115), which nobody can answer now.
      const scopeMoves = await repo.countOpenMovesInto(workspace.id);
      await repo.delete(workspace.id);
      await audit(
        repo,
        actor,
        "workspace.deleted",
        workspace.id,
        { name: workspace.name, members, scopeMoves },
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

/**
 * The workspaces the caller sees, `global` first, for the selects: public ones, and private ones
 * they're a member of (093); root sees every one. With a personal workspace per user (114), listing
 * private ones to everyone would name every user's.
 */
export const listWorkspaces = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
): Promise<Workspace[]> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user;
  return (await deps.repo.list()).filter(
    (w) =>
      // Nobody else's personal workspace (114), root's selects included: one per user would bury
      // the shared ones, and a user's Workspaces dialog never offers someone else's.
      (!w.ownerId || w.ownerId === user?.id) &&
      (w.visibility === "public" ||
        user?.role === "root" ||
        Object.hasOwn(user?.workspaces ?? {}, w.id)),
  );
};

export type WorkspacesTablePage = {
  workspaces: Workspace[];
  next: string | null;
  previous: string | null;
  total: { count: number; capped: boolean };
};

/**
 * One page of root's Workspaces list (090; under Workspaces since 115, where everyone else gets
 * the workspaces they see instead), and the capped count of all that match. Root's alone: a
 * workspace's admins manage theirs from its page. `global` comes first, on the first page,
 * whatever the sort, when the search matches it.
 */
export const pageWorkspaces = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  query: Partial<WorkspacePageQuery>,
): Promise<WorkspacesTablePage> => {
  requirePermission(actor.user, "workspaces.manage");
  const search = query.search?.trim().slice(0, WORKSPACE_SEARCH_MAX_LENGTH) || undefined;
  const sort = query.sort ?? "name";
  // Personal workspaces (114) are listed on their own, with their owners.
  const kind = query.kind === "personal" ? "personal" : "shared";
  const [page, total] = await Promise.all([
    deps.repo.page({
      search,
      sort,
      dir: query.dir ?? (sort === "name" ? "asc" : "desc"),
      size: query.size ?? WORKSPACES_PAGE_SIZE,
      cursor: query.cursor,
      kind,
    }),
    deps.repo.count(search, undefined, kind),
  ]);
  // `global` counts whenever the search matches it, on every page, and is listed first on the first
  // page (no page before it, however it was reached).
  const found = await deps.repo.findByName(GLOBAL_WORKSPACE_NAME);
  const term = search?.toLowerCase();
  const global =
    found &&
    kind === "shared" &&
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

/**
 * One workspace, for its page under Workspaces (115): for anyone signed in who sees it (093);
 * someone else's personal workspace only for root (114). Null otherwise, as for a name no
 * workspace has.
 */
export const viewWorkspace = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  name: string,
): Promise<Workspace | null> => {
  const user = actor.user;
  requirePermission(user, "account.manage_own");
  const workspace = await byName(deps.repo, name);
  if (!workspace || !user) return null;
  const viewer = visibleWorkspaces(user, await deps.repo.list());
  if (!seesWorkspace(viewer, workspace.id)) return null;
  if (workspace.ownerId !== null && workspace.ownerId !== user.id && user.role !== "root")
    return null;
  return workspace;
};

/** One workspace, for root and its admins (092), who manage it: Admin › Scopes. Null otherwise. */
export const findWorkspace = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  name: string,
): Promise<Workspace | null> => {
  if (!canInSome(actor.user, "members.manage")) throw new ForbiddenError("members.manage");
  const workspace = await byName(deps.repo, name);
  return workspace && can(actor.user, "members.manage", workspace.id) ? workspace : null;
};
