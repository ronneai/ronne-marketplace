import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyWorkspaceRepository } from "../repositories/kysely-workspace-repository";
import type { WorkspacePageQuery } from "../repositories/workspace-repository";
import * as members from "../services/members";
import * as service from "../services/workspaces";

export type { WorkspacesTablePage } from "../services/workspaces";

/**
 * Entry points for Admin › Workspaces and the workspace selects (feature 090). Thin: they find
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

export const deleteWorkspace = async (
  headers: Headers,
  input: { name: string },
  app: AppAuth = getAppAuth(),
) => service.deleteWorkspace(deps(app), await actor(headers, app), input);

export const listWorkspaces = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.listWorkspaces(deps(app), await actor(headers, app));

/** Admin › Workspaces' table: `global` first, then sorted, paged with keyset cursors, counted. */
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
