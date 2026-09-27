import { ForbiddenError } from "../exceptions/errors";
import type { Role } from "./user";

/**
 * Every permission, and which roles hold it (MVP §2's matrix). The one place authorization is
 * decided (MVP §9.5): actions call `can()` or `requirePermission()`, never compare roles themselves.
 * Later features add their permissions here, such as `submissions.review` for moderator and root.
 */
export const PERMISSIONS = {
  /** Own password and own access tokens. */
  "account.manage_own": ["user", "moderator", "root"],
  "users.view": ["root"],
  /** Create users, change roles, disable, enable and reset passwords. */
  "users.manage": ["root"],
  "audit.view": ["root"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export const can = (user: { role: Role } | null, permission: Permission): boolean => {
  return user !== null && (PERMISSIONS[permission] as readonly Role[]).includes(user.role);
};

/** Throws ForbiddenError unless the user holds the permission. */
export const requirePermission = (user: { role: Role } | null, permission: Permission): void => {
  if (!can(user, permission)) throw new ForbiddenError(permission);
};
