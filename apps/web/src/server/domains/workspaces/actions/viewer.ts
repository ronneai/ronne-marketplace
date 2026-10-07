import { getCurrentUser } from "../../identity/actions/session";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import type { Viewer } from "../models/viewer";
import { loadViewer } from "../repositories/viewer";

/** The request's viewer (093): who is signed in, and which workspaces' items they see. */
export const viewerFor = async (headers: Headers, app: AppAuth = getAppAuth()): Promise<Viewer> =>
  loadViewer(app.db, await getCurrentUser(headers, app));

/** The viewer for a user already loaded, such as a token's (the registry API, `rmk`, MCP). */
export const viewerOf = (
  user: Pick<CurrentUser, "id" | "role" | "workspaces"> | null,
  app: AppAuth = getAppAuth(),
): Promise<Viewer> => loadViewer(app.db, user);
