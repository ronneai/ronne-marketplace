import type { WorkspaceVisibility } from "./workspace";

/**
 * A request to join a workspace (feature 094). Open until root or the workspace's moderators
 * approve or decline it, or the requester cancels it. Disabling a user cancels theirs; adding them
 * to the workspace directly approves it. A request to a name no workspace has is kept by name, with
 * no workspace, so asking can't tell an unknown name from a private one.
 */
export type AccessRequestStatus = "open" | "approved" | "declined" | "cancelled";

export type AccessRequest = {
  id: string;
  /** Null for a name no workspace has. */
  workspaceId: string | null;
  workspace: string;
  userId: string;
  message: string | null;
  status: AccessRequestStatus;
  /** Why it was declined, shown to the requester. */
  reason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

/** An open request as the Requests tab shows it: who, when and what they said. */
export type PendingRequest = {
  id: string;
  userId: string;
  email: string;
  name: string;
  message: string | null;
  createdAt: Date;
};

/** A request with its workspace's description and visibility, as stored (null with no workspace). */
export type RequestWithWorkspace = AccessRequest & {
  description: string | null;
  visibility: WorkspaceVisibility | null;
};

/**
 * The requester's latest request to one workspace name, for the Workspaces page and the join page.
 * The description and visibility only when the requester sees the workspace: a private one they
 * aren't in looks like a name no workspace has.
 */
export type OwnRequest = Omit<RequestWithWorkspace, "workspaceId" | "userId"> & {
  /** When a declined request can be sent again; null when it can be now (or isn't declined). */
  askAgainFrom: Date | null;
};

export const ACCESS_REQUEST_TEXT_MAX_LENGTH = 500;
/** How many open requests a user may have at once. */
export const OPEN_REQUESTS_LIMIT = 10;
/** How long after a decline the same workspace can be asked again. */
export const DECLINED_WAIT_DAYS = 7;
