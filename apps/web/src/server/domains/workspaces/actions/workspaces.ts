import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyWorkspaceRepository } from "../repositories/kysely-workspace-repository";
import type { WorkspacePageQuery } from "../repositories/workspace-repository";
import * as requests from "../services/access-requests";
import * as members from "../services/members";
import * as moves from "../services/scope-moves";
import * as service from "../services/workspaces";

export type { WorkspacesTablePage } from "../services/workspaces";

/**
 * Entry points for the Workspaces pages and the workspace selects (feature 090; 115). Thin: they find
 * who's asking and wire the dependencies; the services check permissions.
 */
const deps = ({ db, dialect }: AppAuth): service.WorkspaceDeps => ({
  repo: kyselyWorkspaceRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth): Promise<service.WorkspaceActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export const createWorkspace = async (
  headers: Headers,
  input: { name: string; description: string; visibility?: string },
  app: AppAuth = getAppAuth(),
) => service.createWorkspace(deps(app), await actor(headers, app), input);

export const updateWorkspace = async (
  headers: Headers,
  input: { name: string; description: string },
  app: AppAuth = getAppAuth(),
) => service.updateWorkspace(deps(app), await actor(headers, app), input);

/** Root or the workspace's admins rename it (113); its items take the new name. */
export const renameWorkspace = async (
  headers: Headers,
  input: { name: string; to: string },
  app: AppAuth = getAppAuth(),
) => service.renameWorkspace(deps(app), await actor(headers, app), input);

/** How many items a rename would give the new name (113), for its dialog. */
export const renameImpact = async (headers: Headers, name: string, app: AppAuth = getAppAuth()) =>
  service.renameImpact(deps(app), await actor(headers, app), name);

export const deleteWorkspace = async (
  headers: Headers,
  input: { name: string },
  app: AppAuth = getAppAuth(),
) => service.deleteWorkspace(deps(app), await actor(headers, app), input);

export const listWorkspaces = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.listWorkspaces(deps(app), await actor(headers, app));

/** Root's Workspaces table: `global` first, then sorted, paged with keyset cursors, counted. */
export const pageWorkspaces = async (
  headers: Headers,
  query: Partial<WorkspacePageQuery>,
  app: AppAuth = getAppAuth(),
) => service.pageWorkspaces(deps(app), await actor(headers, app), query);

/** Root makes a workspace private or public (093). */
export const setWorkspaceVisibility = async (
  headers: Headers,
  input: { name: string; visibility: string },
  app: AppAuth = getAppAuth(),
) => service.setWorkspaceVisibility(deps(app), await actor(headers, app), input);

/** What turning a workspace private would meet (093): for root's dialog. */
export const visibilityImpact = async (
  headers: Headers,
  name: string,
  app: AppAuth = getAppAuth(),
) => service.visibilityImpact(deps(app), await actor(headers, app), name);

/** A workspace's page under Workspaces (115): anyone who sees it. */
export const viewWorkspace = async (headers: Headers, name: string, app: AppAuth = getAppAuth()) =>
  service.viewWorkspace(deps(app), await actor(headers, app), name);

export const findWorkspace = async (headers: Headers, name: string, app: AppAuth = getAppAuth()) =>
  service.findWorkspace(deps(app), await actor(headers, app), name);

/**
 * Workspace members (feature 092): a workspace's page, for root and its admins, and a user's
 * Workspaces dialog, for root.
 */
export const listMembers = async (
  headers: Headers,
  workspaceId: string,
  app: AppAuth = getAppAuth(),
) => members.listMembers(deps(app), await actor(headers, app), workspaceId);

export const pageMembers = async (
  headers: Headers,
  query: Parameters<typeof members.pageMembers>[2],
  app: AppAuth = getAppAuth(),
) => members.pageMembers(deps(app), await actor(headers, app), query);

export const memberCandidates = async (
  headers: Headers,
  input: { workspaceId: string; query: string },
  app: AppAuth = getAppAuth(),
) => members.memberCandidates(deps(app), await actor(headers, app), input);

export const userMemberships = async (
  headers: Headers,
  userId: string,
  app: AppAuth = getAppAuth(),
) => members.userMemberships(deps(app), await actor(headers, app), userId);

export const addMembers = async (
  headers: Headers,
  input: { workspaceId: string; userIds: readonly string[]; role: string },
  app: AppAuth = getAppAuth(),
) => members.addMembers(deps(app), await actor(headers, app), input);

export const changeMemberRole = async (
  headers: Headers,
  input: { workspaceId: string; userId: string; role: string },
  app: AppAuth = getAppAuth(),
) => members.changeMemberRole(deps(app), await actor(headers, app), input);

export const removeMember = async (
  headers: Headers,
  input: { workspaceId: string; userId: string },
  app: AppAuth = getAppAuth(),
) => members.removeMember(deps(app), await actor(headers, app), input);

export const setUserWorkspaces = async (
  headers: Headers,
  input: { userId: string; workspaces: readonly members.WorkspaceChoice[] },
  app: AppAuth = getAppAuth(),
) => members.setUserWorkspaces(deps(app), await actor(headers, app), input);

/**
 * Asking to join a workspace (feature 094): the Workspaces page and the join link for anyone signed
 * in, the Requests tab and the nav count for root and the workspace's moderators and admins.
 */
export const requestAccess = async (
  headers: Headers,
  input: { workspace: string; message?: string },
  app: AppAuth = getAppAuth(),
) => requests.requestAccess(deps(app), await actor(headers, app), input);

export const cancelAccessRequest = async (
  headers: Headers,
  requestId: string,
  app: AppAuth = getAppAuth(),
) => requests.cancelAccessRequest(deps(app), await actor(headers, app), requestId);

export const approveAccessRequest = async (
  headers: Headers,
  input: { requestId: string; role?: string },
  app: AppAuth = getAppAuth(),
) => requests.approveAccessRequest(deps(app), await actor(headers, app), input);

export const declineAccessRequest = async (
  headers: Headers,
  input: { requestId: string; reason?: string },
  app: AppAuth = getAppAuth(),
) => requests.declineAccessRequest(deps(app), await actor(headers, app), input);

export const pendingRequests = async (
  headers: Headers,
  workspaceId: string,
  app: AppAuth = getAppAuth(),
) => requests.pendingRequests(deps(app), await actor(headers, app), workspaceId);

export const requestsToAnswer = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  requests.requestsToAnswer(deps(app), await actor(headers, app));

export const ownRequests = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  requests.ownRequests(deps(app), await actor(headers, app));

export const myWorkspaces = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  requests.myWorkspaces(deps(app), await actor(headers, app));

/** For 095's API, where the user comes from a bearer token rather than a session. */
export const myWorkspacesAs = async (user: CurrentUser, app: AppAuth = getAppAuth()) =>
  requests.myWorkspaces(deps(app), { user, ip: null });

export const joinTarget = async (headers: Headers, name: string, app: AppAuth = getAppAuth()) =>
  requests.joinTarget(deps(app), await actor(headers, app), name);

export const requestsToAnswerList = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  requests.requestsToAnswerList(deps(app), await actor(headers, app));

/** What moving a scope to another workspace would change, and what refuses it (115). */
export const moveImpact = async (
  headers: Headers,
  input: { scopeId: string; to: string; name?: string },
  app: AppAuth = getAppAuth(),
) => moves.moveImpact(deps(app), await actor(headers, app), input);

/** Moves a scope to another workspace, or asks to (115). */
export const askScopeMove = async (
  headers: Headers,
  input: { scopeId: string; to: string; name?: string; message?: string; confirm?: string },
  app: AppAuth = getAppAuth(),
) => moves.askScopeMove(deps(app), await actor(headers, app), input);

/** Approves a move request: checked again, then moved (115). */
export const approveScopeMove = async (
  headers: Headers,
  input: { moveId: string },
  app: AppAuth = getAppAuth(),
) => moves.approveScopeMove(deps(app), await actor(headers, app), input);

/** Declines a move request, with an optional reason (115). */
export const declineScopeMove = async (
  headers: Headers,
  input: { moveId: string; reason?: string },
  app: AppAuth = getAppAuth(),
) => moves.declineScopeMove(deps(app), await actor(headers, app), input);

/** Cancels a move request: its asker, root, or an admin of the scope's workspace (115). */
export const cancelScopeMove = async (
  headers: Headers,
  input: { moveId: string },
  app: AppAuth = getAppAuth(),
) => moves.cancelScopeMove(deps(app), await actor(headers, app), input);

/** Where a scope could move (115), for the Move dialog's select. */
export const moveTargets = async (
  headers: Headers,
  input: { scopeId: string },
  app: AppAuth = getAppAuth(),
) => moves.moveTargets(deps(app), await actor(headers, app), input);

/** Each scope's latest open or declined move in a workspace (115), for its page's rows. */
export const scopeMovesIn = async (
  headers: Headers,
  input: { workspaceId: string },
  app: AppAuth = getAppAuth(),
) => moves.scopeMovesIn(deps(app), await actor(headers, app), input);

/** The open moves the reader answers, checked again (115): the Requests page and a workspace's tab. */
export const movesToAnswer = async (
  headers: Headers,
  input: { workspaceId?: string } = {},
  app: AppAuth = getAppAuth(),
) => moves.movesToAnswer(deps(app), await actor(headers, app), input);

/** How many moves the reader answers (115), for the nav. */
export const countMovesToAnswer = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  moves.countMovesToAnswer(deps(app), await actor(headers, app));
