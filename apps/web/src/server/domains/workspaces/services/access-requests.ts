import { isValidName, normalizeWorkspaceName } from "@ronneai/core";
import { ForbiddenError } from "../../identity/exceptions/errors";
import {
  can,
  canInSome,
  requirePermission,
  workspacesWith,
} from "../../identity/models/permissions";
import {
  AccessRequestAnsweredError,
  AccessRequestNotFoundError,
  AccessRequestTooSoonError,
  InvalidAccessRequestTextError,
  InvalidRequestRoleError,
  MemberUserNotFoundError,
  RootMembershipError,
  TooManyAccessRequestsError,
  WorkspaceNotFoundError,
} from "../exceptions/errors";
import {
  ACCESS_REQUEST_TEXT_MAX_LENGTH,
  type AccessRequest,
  DECLINED_WAIT_DAYS,
  OPEN_REQUESTS_LIMIT,
  type OwnRequest,
  type PendingRequest,
} from "../models/access-request";
import type { Workspace } from "../models/workspace";
import type { WorkspaceRepository } from "../repositories/workspace-repository";
import type { WorkspaceActor, WorkspaceDeps } from "./workspaces";

/**
 * Asking to join a workspace (feature 094). Anyone signed in asks; root, or the workspace's
 * moderators and admins, approve or decline; the requester cancels. One open request per user and
 * workspace, at most 10 open per user, and 7 days after a decline before asking the same workspace
 * again. The first answer wins: every change locks the requester's user row, then the request's.
 */

const now = (deps: WorkspaceDeps) => (deps.now ?? (() => new Date()))();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A message or a reason: trimmed, at most 500 characters, null when empty. A NUL character is
 * refused: PostgreSQL can't store one in text, and the others can, so it would fail on one only.
 */
const textFrom = (value: string | undefined, field: "message" | "reason"): string | null => {
  const text = value?.trim() ?? "";
  if ([...text].length > ACCESS_REQUEST_TEXT_MAX_LENGTH || text.includes("\u0000"))
    throw new InvalidAccessRequestTextError(field);
  return text || null;
};

type RequestEvent =
  | "workspace.access_requested"
  | "workspace.access_approved"
  | "workspace.access_declined"
  | "workspace.access_cancelled";

/** One step of a request in the audit log, on the requester, naming the workspace. */
export const auditRequest = (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  action: RequestEvent,
  request: { workspace: string; userId: string; email: string },
  at: Date,
  extra: Record<string, string | boolean> = {},
) =>
  repo.recordAudit(
    {
      actorId: actor.user?.id ?? null,
      action,
      target: { type: "user", id: request.userId },
      metadata: { workspace: request.workspace, email: request.email, ...extra },
      ipAddress: actor.ip,
    },
    at,
  );

export type RequestAccessResult = "sent" | "already_requested" | "already_member";

/**
 * Asks to join a workspace by name: from the Workspaces page for a public one, from its join link
 * for a private one. A name no workspace has is kept as a request too, by name, so it answers,
 * counts against the limit and shows to its requester exactly as a private workspace's does: asking
 * can't tell whether a name exists. Only a name that can't be a workspace's isn't kept.
 */
export const requestAccess = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { workspace: string; message?: string },
): Promise<RequestAccessResult> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user;
  if (!user) throw new ForbiddenError("account.manage_own");
  const message = textFrom(input.message, "message");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    await repo.lockUsers([user.id]);
    // Read again under the lock: a user disabled meanwhile had their requests cancelled.
    const stored = await repo.memberUser(user.id);
    if (!stored || stored.disabled) throw new ForbiddenError("account.manage_own");
    if (stored.root) return "already_member";
    const name = normalizeWorkspaceName(input.workspace);
    if (!isValidName(name, "item")) return "sent";
    const found = await repo.findByName(name);
    // Compared byte for byte: MySQL's collation could match a lookalike.
    const workspace = found?.name === name ? found : null;
    if (workspace && (await repo.memberRole(workspace.id, user.id))) return "already_member";
    // A name no workspace can have (reserved, such as `admin`) tells nothing: it isn't kept.
    if (!workspace && !isValidName(name, "workspace")) return "sent";
    const latest = await repo.latestRequest(name, user.id);
    if (latest?.status === "open") return "already_requested";
    if ((await repo.countOpenRequestsBy(user.id)) >= OPEN_REQUESTS_LIMIT)
      throw new TooManyAccessRequestsError(OPEN_REQUESTS_LIMIT);
    // A decline waits 7 days, unless they've been added or removed since: then they ask at once.
    if (latest?.status === "declined" && latest.decidedAt) {
      const after = new Date(latest.decidedAt.getTime() + DECLINED_WAIT_DAYS * DAY_MS);
      if (after > at && !(await repo.membershipChangedSince(name, user.id, latest.decidedAt)))
        throw new AccessRequestTooSoonError(after);
    }
    await repo.insertAccessRequest({
      workspaceId: workspace?.id ?? null,
      workspaceName: name,
      userId: user.id,
      message,
      at,
    });
    await auditRequest(
      repo,
      actor,
      "workspace.access_requested",
      { workspace: name, userId: user.id, email: user.email },
      at,
    );
    return "sent";
  });
};

/** The requester takes back their open request. Anyone else's is not found. */
export const cancelAccessRequest = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  requestId: string,
): Promise<void> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user;
  if (!user) throw new ForbiddenError("account.manage_own");
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await repo.lockUsers([user.id]);
    await repo.lockAccessRequest(requestId);
    const request = await repo.accessRequest(requestId);
    if (!request || request.userId !== user.id) throw new AccessRequestNotFoundError();
    if (request.status !== "open") throw new AccessRequestAnsweredError();
    const cancelled = await repo.decideAccessRequest(request.id, {
      status: "cancelled",
      decidedBy: user.id,
      reason: null,
      at,
    });
    if (!cancelled) throw new AccessRequestAnsweredError();
    await auditRequest(
      repo,
      actor,
      "workspace.access_cancelled",
      { workspace: request.workspace, userId: user.id, email: user.email },
      at,
    );
  });
};

const requireAnswererSomewhere = (actor: WorkspaceActor) => {
  if (!canInSome(actor.user, "access_requests.answer"))
    throw new ForbiddenError("access_requests.answer");
};

/**
 * Root, or a moderator or admin of the request's workspace, with the role read again under the
 * lock: one demoted meanwhile is refused.
 */
const requireAnswererNow = async (
  repo: WorkspaceRepository,
  actor: WorkspaceActor,
  workspace: Workspace,
) => {
  requirePermission(actor.user, "access_requests.answer", workspace.id);
  if (actor.user?.role === "root") return;
  const role = await repo.memberRole(workspace.id, actor.user?.id ?? "");
  if (role !== "moderator" && role !== "admin") throw new ForbiddenError("access_requests.answer");
};

/**
 * Runs an answer to an open request: refuses anyone who can't answer, locks the requester and the
 * answerer (in id order, as the member services do), then the request, and reads it again, so the
 * first of two answers wins and the second is told it's answered.
 */
const answering = async <T>(
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  requestId: string,
  work: (
    repo: WorkspaceRepository,
    request: AccessRequest,
    workspace: Workspace,
    requester: { id: string; email: string; root: boolean },
  ) => Promise<T>,
): Promise<T> => {
  requireAnswererSomewhere(actor);
  const found = await deps.repo.accessRequest(requestId);
  if (!found) throw new AccessRequestNotFoundError();
  return deps.repo.transaction(async (repo) => {
    await repo.lockUsers(actor.user ? [found.userId, actor.user.id] : [found.userId]);
    await repo.lockAccessRequest(found.id);
    const request = await repo.accessRequest(found.id);
    // A request to a name no workspace has: nobody answers it.
    if (!request?.workspaceId) throw new AccessRequestNotFoundError();
    const workspace = await repo.findById(request.workspaceId);
    if (!workspace) throw new WorkspaceNotFoundError();
    await requireAnswererNow(repo, actor, workspace);
    if (request.status !== "open") throw new AccessRequestAnsweredError();
    const requester = await repo.memberUser(request.userId);
    if (!requester) throw new MemberUserNotFoundError();
    return work(repo, request, workspace, requester);
  });
};

/**
 * Approves a request: the requester joins as `user`, or as `moderator` when someone who manages
 * the workspace's members (root, its admins) picks it. The membership is written and audited as
 * adding a member is (092).
 */
export const approveAccessRequest = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { requestId: string; role?: string },
): Promise<void> => {
  const role = input.role || "user";
  if (role !== "user" && role !== "moderator") throw new InvalidRequestRoleError(role);
  const at = now(deps);
  await answering(deps, actor, input.requestId, async (repo, request, workspace, requester) => {
    if (role !== "user" && !can(actor.user, "members.manage", workspace.id))
      throw new ForbiddenError("members.manage");
    if (requester.root) throw new RootMembershipError();
    // Locked and read open just before; the guard in the update is a second safeguard.
    if (
      !(await repo.decideAccessRequest(request.id, {
        status: "approved",
        decidedBy: actor.user?.id ?? null,
        reason: null,
        at,
      }))
    )
      throw new AccessRequestAnsweredError();
    // Adding them directly approves the request (`members.ts`), so they're seldom in it already.
    const joins = !(await repo.memberRole(workspace.id, requester.id));
    if (joins)
      await repo.putMember({
        workspaceId: workspace.id,
        userId: requester.id,
        role,
        addedBy: actor.user?.id ?? null,
        at,
      });
    const event = { workspace: workspace.name, userId: requester.id, email: requester.email };
    await auditRequest(repo, actor, "workspace.access_approved", event, at, { role });
    if (joins)
      await repo.recordAudit(
        {
          actorId: actor.user?.id ?? null,
          action: "workspace.member_added",
          target: { type: "user", id: requester.id },
          metadata: { workspace: workspace.name, email: requester.email, role },
          ipAddress: actor.ip,
        },
        at,
      );
  });
};

/** Declines a request, with an optional reason the requester sees. */
export const declineAccessRequest = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  input: { requestId: string; reason?: string },
): Promise<void> => {
  const reason = textFrom(input.reason, "reason");
  const at = now(deps);
  await answering(deps, actor, input.requestId, async (repo, request, workspace, requester) => {
    // Locked and read open just before; the guard in the update is a second safeguard.
    if (
      !(await repo.decideAccessRequest(request.id, {
        status: "declined",
        decidedBy: actor.user?.id ?? null,
        reason,
        at,
      }))
    )
      throw new AccessRequestAnsweredError();
    await auditRequest(
      repo,
      actor,
      "workspace.access_declined",
      { workspace: workspace.name, userId: requester.id, email: requester.email },
      at,
    );
  });
};

/** How many open requests the Requests tab lists at most. */
export const PENDING_REQUESTS_SHOWN = 100;

/** A workspace's open requests, oldest first, and how many there are: its Requests tab. */
export const pendingRequests = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
  workspaceId: string,
): Promise<{ requests: PendingRequest[]; total: number }> => {
  requireAnswererSomewhere(actor);
  const workspace = await deps.repo.findById(workspaceId);
  if (!workspace) throw new WorkspaceNotFoundError();
  requirePermission(actor.user, "access_requests.answer", workspace.id);
  const [requests, total] = await Promise.all([
    deps.repo.pendingRequests(workspace.id, PENDING_REQUESTS_SHOWN),
    deps.repo.countPendingRequests([workspace.id]),
  ]);
  return { requests, total };
};

/** The nav count: open requests in every workspace the actor can answer in; 0 for anyone else. */
export const requestsToAnswer = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
): Promise<number> => {
  const where = workspacesWith(actor.user, "access_requests.answer");
  if (where !== "all" && where.length === 0) return 0;
  return deps.repo.countPendingRequests(where);
};

/** How many of a user's requests the Workspaces page reads. */
const OWN_REQUESTS_READ = 200;

/**
 * The actor's latest request to each workspace name, newest first: the Workspaces page shows each
 * as Requested (cancel) or Declined on a date, and lists the ones asked from a link. A workspace's
 * description and visibility show only when the actor sees it; a private one they aren't in shows
 * as a name, as a name no workspace has does.
 */
export const ownRequests = async (
  deps: WorkspaceDeps,
  actor: WorkspaceActor,
): Promise<OwnRequest[]> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user;
  if (!user) return [];
  const seen = new Set<string>();
  const latest: OwnRequest[] = [];
  for (const { workspaceId, userId: _userId, ...request } of await deps.repo.requestsOf(
    user.id,
    OWN_REQUESTS_READ,
  )) {
    if (seen.has(request.workspace)) continue;
    seen.add(request.workspace);
    const sees =
      workspaceId !== null &&
      (request.visibility === "public" || Object.hasOwn(user.workspaces, workspaceId));
    latest.push(sees ? request : { ...request, description: null, visibility: null });
  }
  return latest;
};
