import type { KeysetPage } from "../../../db/keyset";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { canInSome, requirePermission } from "../../identity/models/permissions";
import { isWorkspaceRole, type WorkspaceRole } from "../../identity/models/user";
import {
  GlobalMembershipError,
  InvalidMemberRoleError,
  MemberUserNotFoundError,
  NotAWorkspaceMemberError,
  OwnMembershipError,
  RootMembershipError,
  WorkspaceNotFoundError,
  WorkspacesError,
} from "../exceptions/errors";
import type { Member, Membership, MemberUser } from "../models/member";
import type { Workspace } from "../models/workspace";
import type { MemberPageQuery, WorkspaceRepository } from "../repositories/workspace-repository";
import type { WorkspaceActor, WorkspaceDeps } from "./workspaces";

/**
 * Workspace members (feature 092): root, or the workspace's admins, add people to a workspace with a
 * role (admin included), change the role and remove them. A user's whole set of workspaces, from
 * Admin › Users, stays root's. Nobody leaves `global`, and root's own memberships aren't managed (root works
 * everywhere, 091). Each change writes or deletes one row, so two roots at once each win on their
 * own rows; every change is audited in the same transaction.
 */

const now = (deps: WorkspaceDeps) => (deps.now ?? (() => new Date()))();

const roleFrom = (value: string): WorkspaceRole => {
  if (!isWorkspaceRole(value)) throw new InvalidMemberRoleError(value);
  return value;
};

const workspaceById = async (repo: WorkspaceRepository, id: string): Promise<Workspace> => {
  const workspace = await repo.findById(id);
  if (!workspace) throw new WorkspaceNotFoundError();
  return workspace;
};

/** The user a membership is about: they exist, and they aren't root. */
const memberUser = async (repo: WorkspaceRepository, userId: string): Promise<MemberUser> => {
  const user = await repo.memberUser(userId);
  if (!user) throw new MemberUserNotFoundError();
  if (user.root) throw new RootMembershipError();
  return user;
};

/**
 * Runs a member change; when the database refuses it because a workspace went meanwhile (its
 * foreign key), answers WorkspaceNotFoundError rather than the database's message. Nothing was
 * written: the transaction rolled back.
 */
const changing = async <T>(
  repo: WorkspaceRepository,
  workspaceIds: readonly string[],
  work: () => Promise<T>,
): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof WorkspacesError) throw error;
    for (const id of workspaceIds)
      if (!(await repo.findById(id))) throw new WorkspaceNotFoundError();
    throw error;
  }
};

/**
 * Who manages a workspace's members (092): root, in every workspace, and the workspace's admins.
 * Someone who manages none is refused before anything is looked up.
 */
const requireManagerSomewhere = (actor: WorkspaceActor) => {
  if (!canInSome(actor.user, "members.manage")) throw new ForbiddenError("members.manage");
};

const requireManagerOf = (actor: WorkspaceActor, workspace: Workspace) =>
  requirePermission(actor.user, "members.manage", workspace.id);

/**
 * The same, read again under the lock (092): the actor's role as stored now, not as loaded with
 * the request, so two admins demoting each other at once leave one of them admin.
 */
const requireManagerNow = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  workspace: Workspace,
) => {
  requireManagerOf(actor, workspace);
  if (actor.user?.role === "root") return;
  if ((await repo.memberRole(workspace.id, actor.user?.id ?? "")) !== "admin")
    throw new ForbiddenError("members.manage");
};

/** The users to lock: the people changed, and the actor, whose own role is read again. */
const toLock = (actor: WorkspaceActor, userIds: readonly string[]) =>
  actor.user ? [...userIds, actor.user.id] : [...userIds];

/**
 * Nobody changes or removes their own membership, so an admin can't lock themselves out (092).
 * Compared with the stored id: MySQL finds a user by an id in another case too.
 */
const notOwn = (actor: WorkspaceActor, user: MemberUser) => {
  if (actor.user?.id === user.id) throw new OwnMembershipError();
};

type MemberEvent =
  | { action: "workspace.member_added"; role: WorkspaceRole }
  | { action: "workspace.member_role_changed"; from: WorkspaceRole; to: WorkspaceRole }
  | { action: "workspace.member_removed"; role: WorkspaceRole };

/** One membership change in the audit log, on the user, naming the workspace. */
const audit = (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  workspace: Workspace,
  user: MemberUser,
  event: MemberEvent,
  at: Date,
) => {
  const { action, ...change } = event;
  return repo.recordAudit(
    {
      actorId: actor.user?.id ?? null,
      action,
      target: { type: "user", id: user.id },
      metadata: { workspace: workspace.name, email: user.email, ...change },
      ipAddress: actor.ip,
    },
    at,
  );
};

/** A workspace's members, by name: its page's Members table. */
export const listMembers = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  workspaceId: string,
): Promise<Member[]> => {
  requireManagerSomewhere(actor);
  const workspace = await workspaceById(deps.repo, workspaceId);
  requireManagerOf(actor, workspace);
  return deps.repo.members(workspace.id);
};

/** One page of a workspace's Members table (092): searched, filtered by role, with the count. */
export const pageMembers = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  query: Omit<MemberPageQuery, "workspaceId" | "sort" | "dir" | "size" | "role"> &
    Partial<Pick<MemberPageQuery, "sort" | "dir" | "size">> & {
      workspaceId: string;
      /** Anything but a workspace role is no filter. */
      role?: string;
    },
): Promise<KeysetPage<Member> & { total: { count: number; capped: boolean } }> => {
  requireManagerSomewhere(actor);
  const workspace = await workspaceById(deps.repo, query.workspaceId);
  requireManagerOf(actor, workspace);
  const search = query.search?.trim().slice(0, 100) || undefined;
  const role = query.role && isWorkspaceRole(query.role) ? query.role : undefined;
  const filters = { workspaceId: workspace.id, search, role };
  const sort = query.sort === "added" ? "added" : "name";
  const [page, total] = await Promise.all([
    deps.repo.memberPage({
      ...filters,
      sort,
      dir:
        query.dir === "desc" || query.dir === "asc" ? query.dir : sort === "name" ? "asc" : "desc",
      size: query.size && query.size > 0 && query.size <= 100 ? query.size : 50,
      cursor: query.cursor,
    }),
    deps.repo.memberCount(filters),
  ]);
  return { ...page, total };
};

/** A user's memberships, `global` first: their Workspaces dialog. Root's aren't managed. */
export const userMemberships = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  userId: string,
): Promise<Membership[]> => {
  requirePermission(actor.user, "workspaces.manage");
  await memberUser(deps.repo, userId);
  return deps.repo.membershipsOf(userId);
};

/** How many people Add members suggests at once. */
const CANDIDATES = 10;

/**
 * People to add to a workspace (092), for its Add members search: not in it yet, not root (who
 * works everywhere) and not disabled, whose email or name contains the search; by email.
 */
export const memberCandidates = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { workspaceId: string; query: string },
): Promise<{ id: string; email: string; name: string }[]> => {
  requireManagerSomewhere(actor);
  const workspace = await workspaceById(deps.repo, input.workspaceId);
  requireManagerOf(actor, workspace);
  const term = input.query.trim().slice(0, 100);
  if (!term) return [];
  return deps.repo.candidates(workspace.id, term, CANDIDATES);
};

export type AddedMember = { userId: string; result: "added" | "already_member" };

/**
 * Adds people to a workspace, all with one role. Someone already in it is left as they are (their
 * role changes with `changeMemberRole`). Root can't be added; a disabled user can, from their user
 * page. Every added row is audited.
 */
export const addMembers = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { workspaceId: string; userIds: readonly string[]; role: string },
): Promise<AddedMember[]> => {
  requireManagerSomewhere(actor);
  const role = roleFrom(input.role);
  const at = now(deps);
  return changing(deps.repo, [input.workspaceId], () =>
    deps.repo.transaction(async (repo) => {
      await repo.lockUsers(toLock(actor, input.userIds));
      const workspace = await workspaceById(repo, input.workspaceId);
      await requireManagerNow(repo, actor, workspace);
      const results: AddedMember[] = [];
      for (const userId of new Set(input.userIds)) {
        const user = await memberUser(repo, userId);
        if (await repo.memberRole(workspace.id, user.id)) {
          results.push({ userId, result: "already_member" });
          continue;
        }
        await repo.putMember({
          workspaceId: workspace.id,
          userId: user.id,
          role,
          addedBy: actor.user?.id ?? null,
          at,
        });
        await audit(repo, actor, workspace, user, { action: "workspace.member_added", role }, at);
        results.push({ userId, result: "added" });
      }
      return results;
    }),
  );
};

/** Changes a member's role in a workspace, `global` included. The same role changes nothing. */
export const changeMemberRole = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { workspaceId: string; userId: string; role: string },
): Promise<void> => {
  requireManagerSomewhere(actor);
  const role = roleFrom(input.role);
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await repo.lockUsers(toLock(actor, [input.userId]));
    const workspace = await workspaceById(repo, input.workspaceId);
    await requireManagerNow(repo, actor, workspace);
    const user = await memberUser(repo, input.userId);
    notOwn(actor, user);
    const from = await repo.memberRole(workspace.id, user.id);
    if (!from) throw new NotAWorkspaceMemberError(workspace.name);
    if (from === role) return;
    await repo.putMember({
      workspaceId: workspace.id,
      userId: user.id,
      role,
      addedBy: actor.user?.id ?? null,
      at,
    });
    await audit(
      repo,
      actor,
      workspace,
      user,
      { action: "workspace.member_role_changed", from, to: role },
      at,
    );
  });
};

/**
 * Removes someone from a workspace; never from `global`. Their drafts and open submissions there
 * stay: they still read and withdraw them, and its moderators decide them (091).
 */
export const removeMember = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { workspaceId: string; userId: string },
): Promise<void> => {
  requireManagerSomewhere(actor);
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await repo.lockUsers(toLock(actor, [input.userId]));
    const workspace = await workspaceById(repo, input.workspaceId);
    await requireManagerNow(repo, actor, workspace);
    if (workspace.isGlobal) throw new GlobalMembershipError();
    const user = await memberUser(repo, input.userId);
    notOwn(actor, user);
    const role = await repo.memberRole(workspace.id, user.id);
    if (!role) return;
    await repo.removeMember(workspace.id, user.id);
    await audit(repo, actor, workspace, user, { action: "workspace.member_removed", role }, at);
  });
};

export type WorkspaceChoice = { workspaceId: string; role: string };

/**
 * Sets a user's memberships to `wanted` (their Workspaces dialog, 092): adds, changes and removes
 * the difference in one transaction, an event per change. `global` stays, with the role wanted, or
 * as it was when it isn't listed.
 */
export const setUserWorkspaces = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { userId: string; workspaces: readonly WorkspaceChoice[] },
): Promise<{ added: number; changed: number; removed: number }> => {
  requirePermission(actor.user, "workspaces.manage");
  const choices = input.workspaces.map((w) => ({ id: w.workspaceId, role: roleFrom(w.role) }));
  const at = now(deps);
  return changing(
    deps.repo,
    choices.map((c) => c.id),
    () =>
      deps.repo.transaction(async (repo) => {
        await repo.lockUsers([input.userId]);
        const user = await memberUser(repo, input.userId);
        // Keyed by each workspace's stored id: MySQL matches ids ignoring case and trailing spaces, so
        // the id as sent could miss the user's own row and remove it.
        const wanted = new Map<string, { workspace: Workspace; role: WorkspaceRole }>();
        for (const choice of choices) {
          const workspace = await workspaceById(repo, choice.id);
          wanted.set(workspace.id, { workspace, role: choice.role });
        }
        const current = new Map(
          (await repo.membershipsOf(user.id)).map((m) => [m.workspaceId, m.role]),
        );
        const counts = { added: 0, changed: 0, removed: 0 };
        for (const [workspaceId, { workspace, role }] of wanted) {
          const from = current.get(workspaceId);
          if (from === role) continue;
          await repo.putMember({
            workspaceId,
            userId: user.id,
            role,
            addedBy: actor.user?.id ?? null,
            at,
          });
          if (from) {
            await audit(
              repo,
              actor,
              workspace,
              user,
              { action: "workspace.member_role_changed", from, to: role },
              at,
            );
            counts.changed += 1;
          } else {
            await audit(
              repo,
              actor,
              workspace,
              user,
              { action: "workspace.member_added", role },
              at,
            );
            counts.added += 1;
          }
        }
        for (const [workspaceId, role] of current) {
          if (wanted.has(workspaceId)) continue;
          const workspace = await workspaceById(repo, workspaceId);
          if (workspace.isGlobal) continue;
          await repo.removeMember(workspaceId, user.id);
          await audit(
            repo,
            actor,
            workspace,
            user,
            { action: "workspace.member_removed", role },
            at,
          );
          counts.removed += 1;
        }
        return counts;
      }),
  );
};
