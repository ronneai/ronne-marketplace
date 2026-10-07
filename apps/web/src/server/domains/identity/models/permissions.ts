import { ForbiddenError } from "../exceptions/errors";
import type { Memberships, Role, WorkspaceRole } from "./user";

/**
 * Permissions held instance-wide, by `user.role` (MVP §2's matrix). Root holds them all.
 */
export const INSTANCE_PERMISSIONS = {
  /** Own password and own access tokens. */
  "account.manage_own": ["user", "root"],
  "users.view": ["root"],
  /** Create users, change roles, disable, enable and reset passwords. */
  "users.manage": ["root"],
  "audit.view": ["root"],
  /** Create workspaces, edit their descriptions and delete empty ones (feature 090). */
  "workspaces.manage": ["root"],
  /** Create scopes and edit their descriptions (feature 010). */
  "scopes.manage": ["root"],
  /** Approve your own submission, with a reason; audited as an override (MVP §2, feature 014). */
  "submissions.override": ["root"],
  /** Instance settings, such as the usage policy (feature 046). */
  "settings.manage": ["root"],
} as const satisfies Record<string, readonly Role[]>;

/**
 * Permissions held in a workspace, by the role there (feature 091). Root holds them in every
 * workspace; anyone else needs a membership with one of these roles.
 */
export const WORKSPACE_PERMISSIONS = {
  /** Create, edit, submit and withdraw your own drafts, propose changes (012, 091). */
  "submissions.create": ["user", "moderator"],
  /** Open submitted (not draft) submissions read-only; 014's review queue builds on it. */
  "submissions.view_submitted": ["moderator"],
  /** Approve, request changes on or reject others' submissions, and comment on any (feature 014). */
  "submissions.review": ["moderator"],
  /** Release any approved submission; authors release their own without it (MVP §2, 015). */
  "submissions.publish": ["moderator"],
  /** Move and remove dist-tags, deprecate and yank versions (MVP §2, feature 016). */
  "versions.manage": ["moderator"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;

export type InstancePermission = keyof typeof INSTANCE_PERMISSIONS;
export type WorkspacePermission = keyof typeof WORKSPACE_PERMISSIONS;
export type Permission = InstancePermission | WorkspacePermission;

/** Who a check is about: the instance role, and the memberships for workspace permissions. */
export type Subject = { role: Role; workspaces?: Memberships };

const isWorkspacePermission = (permission: Permission): permission is WorkspacePermission =>
  permission in WORKSPACE_PERMISSIONS;

const holdsIn = (user: Subject, permission: WorkspacePermission, workspaceId: string): boolean => {
  if (user.role === "root") return true;
  const role = user.workspaces?.[workspaceId];
  return (
    role !== undefined && (WORKSPACE_PERMISSIONS[permission] as readonly string[]).includes(role)
  );
};

/**
 * The one place authorization is decided (MVP §9.5): actions call `can()` or
 * `requirePermission()`, never compare roles themselves. A workspace permission needs the
 * workspace it's checked in (the scope's, for an item or a submission), so leaving it out doesn't
 * type-check.
 */
type Can = {
  (user: Subject | null, permission: InstancePermission): boolean;
  (user: Subject | null, permission: WorkspacePermission, workspaceId: string): boolean;
};

export const can = ((user: Subject | null, permission: Permission, workspaceId?: string) => {
  if (user === null) return false;
  if (isWorkspacePermission(permission))
    return workspaceId !== undefined && holdsIn(user, permission, workspaceId);
  return (INSTANCE_PERMISSIONS[permission] as readonly string[]).includes(user.role);
}) as Can;

type RequirePermission = {
  (user: Subject | null, permission: InstancePermission): void;
  (user: Subject | null, permission: WorkspacePermission, workspaceId: string): void;
};

/** Throws ForbiddenError unless the user holds the permission (in that workspace). */
export const requirePermission = ((
  user: Subject | null,
  permission: Permission,
  workspaceId?: string,
) => {
  if (
    !(can as (u: Subject | null, p: Permission, w?: string) => boolean)(
      user,
      permission,
      workspaceId,
    )
  )
    throw new ForbiddenError(permission);
}) as RequirePermission;

/**
 * The workspaces where the user holds a workspace permission: `"all"` for root, otherwise the ids
 * of their memberships with a role that has it. For lists and queues filtered to what the user may
 * act on, such as the review queue (091).
 */
export const workspacesWith = (
  user: Subject | null,
  permission: WorkspacePermission,
): "all" | string[] => {
  if (user === null) return [];
  if (user.role === "root") return "all";
  return Object.keys(user.workspaces ?? {}).filter((id) => holdsIn(user, permission, id));
};

/**
 * Whether the user holds a workspace permission in at least one workspace (091): for the nav and
 * the pages behind it, and to refuse someone outright before the check in the item's workspace.
 */
export const canInSome = (user: Subject | null, permission: WorkspacePermission): boolean => {
  const where = workspacesWith(user, permission);
  return where === "all" || where.length > 0;
};
