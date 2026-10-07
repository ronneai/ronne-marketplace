import { requirePermission } from "../../identity/models/permissions";
import { isWorkspaceRole, type WorkspaceRole } from "../../identity/models/user";
import {
  GlobalMembershipError,
  InvalidMemberRoleError,
  MemberUserNotFoundError,
  NotAWorkspaceMemberError,
  RootMembershipError,
  WorkspaceNotFoundError,
  WorkspacesError,
} from "../exceptions/errors";
import type { Member, Membership, MemberUser } from "../models/member";
import type { Workspace } from "../models/workspace";
import type { WorkspaceRepository } from "../repositories/workspace-repository";
import type { WorkspaceActor, WorkspaceDeps } from "./workspaces";

/**
 * Workspace members (feature 092): root adds people to a workspace with a role, changes the role and
 * removes them. Nobody leaves `global`, and root's own memberships aren't managed (root works
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
  requirePermission(actor.user, "workspaces.manage");
  await workspaceById(deps.repo, workspaceId);
  return deps.repo.members(workspaceId);
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
  requirePermission(actor.user, "workspaces.manage");
  const role = roleFrom(input.role);
  const at = now(deps);
  return changing(deps.repo, [input.workspaceId], () =>
    deps.repo.transaction(async (repo) => {
      await repo.lockUsers(input.userIds);
      const workspace = await workspaceById(repo, input.workspaceId);
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
  requirePermission(actor.user, "workspaces.manage");
  const role = roleFrom(input.role);
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await repo.lockUsers([input.userId]);
    const workspace = await workspaceById(repo, input.workspaceId);
    const user = await memberUser(repo, input.userId);
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
  requirePermission(actor.user, "workspaces.manage");
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await repo.lockUsers([input.userId]);
    const workspace = await workspaceById(repo, input.workspaceId);
    if (workspace.isGlobal) throw new GlobalMembershipError();
    const user = await memberUser(repo, input.userId);
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
