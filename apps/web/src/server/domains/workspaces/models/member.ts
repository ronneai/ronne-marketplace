import type { WorkspaceRole } from "../../identity/models/user";

/**
 * A workspace's member (feature 092): a user and their role there, moderator or user (091).
 * Everyone but root is a member of `global`, and nobody leaves it.
 */
export type Member = {
  userId: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  /** A disabled user's memberships stay, and show. */
  disabled: boolean;
  addedAt: Date;
};

/** A user's membership of one workspace, for their Workspaces dialog. */
export type Membership = { workspaceId: string; workspace: string; role: WorkspaceRole };

/** Who a membership is about, as the member services check them. */
export type MemberUser = {
  id: string;
  email: string;
  name: string;
  root: boolean;
  disabled: boolean;
};
