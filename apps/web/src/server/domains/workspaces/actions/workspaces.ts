import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyWorkspaceRepository } from "../repositories/kysely-workspace-repository";
import type { WorkspacePageQuery } from "../repositories/workspace-repository";
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

export const findWorkspace = async (headers: Headers, name: string, app: AppAuth = getAppAuth()) =>
  service.findWorkspace(deps(app), await actor(headers, app), name);
