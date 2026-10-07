import type { CurrentUser } from "../../identity/models/user";
import type { WorkspaceVisibility } from "./workspace";

/**
 * Who is reading (feature 093): what decides which items, versions, scopes and workspaces they see.
 * Built once per request from the user and their memberships (091). Every public workspace is
 * visible to everyone signed in; a private one only to its members, any role, and to root.
 */
export type Viewer = {
  /** Null when nobody is signed in: everything needs a session or a token, so they see nothing. */
  userId: string | null;
  /** Root sees every workspace, private or not, without being a member. */
  root: boolean;
  /** The workspaces whose items they see, sorted. */
  workspaceIds: readonly string[];
  /**
   * The private workspaces among them, sorted: the plugin feeds' visibility key (077, 079). Empty
   * for anyone who sees only public ones, so they all share one marketplace.
   */
  privateWorkspaceIds: readonly string[];
};

/** A workspace as the viewer needs it: its id and whether it's private. */
export type WorkspaceVisibilityRow = { id: string; visibility: WorkspaceVisibility };

const sorted = (ids: Iterable<string>) => [...ids].sort();

/**
 * The workspaces `user` sees, from every workspace on the instance: the public ones and the private
 * ones they're a member of; all of them for root; none signed out. A role doesn't matter: any member
 * of a private workspace sees its items.
 */
export const visibleWorkspaces = (
  user: Pick<CurrentUser, "id" | "role" | "workspaces"> | null,
  workspaces: readonly WorkspaceVisibilityRow[],
): Viewer => {
  if (!user) return { userId: null, root: false, workspaceIds: [], privateWorkspaceIds: [] };
  const root = user.role === "root";
  const seen = workspaces.filter(
    (w) => root || w.visibility === "public" || Object.hasOwn(user.workspaces, w.id),
  );
  return {
    userId: user.id,
    root,
    workspaceIds: sorted(seen.map((w) => w.id)),
    privateWorkspaceIds: sorted(seen.filter((w) => w.visibility === "private").map((w) => w.id)),
  };
};

/** Whether the viewer sees a workspace's items. */
export const seesWorkspace = (viewer: Viewer, workspaceId: string): boolean =>
  viewer.root || viewer.workspaceIds.includes(workspaceId);

/** The plugin feeds' cache key for this viewer (093): the private workspaces they see. */
export const visibilityKey = (viewer: Viewer): string => viewer.privateWorkspaceIds.join(",");

/**
 * Sees every workspace, as root does, for code that isn't reading on someone's behalf: a release
 * already authorised by the release rules (015), the checks run at submit (task 4 narrows them).
 * Never for what a person or a token reads.
 */
export const UNFILTERED: Viewer = {
  userId: null,
  root: true,
  workspaceIds: [],
  privateWorkspaceIds: [],
};
