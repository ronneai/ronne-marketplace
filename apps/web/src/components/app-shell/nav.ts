import { DOCS_URL } from "@/components/help/topics";
import {
  can,
  canInSome,
  type Permission,
  WORKSPACE_PERMISSIONS,
  type WorkspacePermission,
} from "@/server/domains/identity/models/permissions";
import type { Memberships } from "@/server/domains/identity/models/user";

export type ShellUser = {
  name: string;
  email: string;
  role: "root" | "user";
  workspaces?: Memberships;
};

/** An item shows when it needs no permission, or the user holds it (the one permission map, 008). */
export type NavItem = {
  href: string;
  label: string;
  permission?: Permission;
  /** The item is current on every path under this one (or these), for example "/admin". */
  section?: string | string[];
  /** Shown at the right of the header, next to the appearance switch: Admin and Docs. */
  end?: true;
  /** Another site, opened in a new tab: Docs, the Documentation on the website (088). */
  external?: true;
  /** Hidden from someone who holds this one: root's Admin replaces a workspace admin's (092). */
  unless?: Exclude<Permission, WorkspacePermission>;
  /** Shown only while its count is above 0: Requests (094), for moderators of a quiet workspace. */
  onlyWithCount?: true;
};

/**
 * Top navigation. Only pages that exist are listed (feature 032): Composer and Releases join as
 * their features land. Catalogue (018) is current on item pages too. Workspaces (094) moved here
 * from the account menu (owner, 2026-10-10). Admin and Docs (033) sit at
 * the right, before the appearance switch (owner's request, 2026-09-28). Docs opens the
 * Documentation on the website in a new tab (088).
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/catalogue", label: "Catalogue", section: ["/catalogue", "/items"] },
  // Every signed-in user's workspaces and joining (094); after Catalogue (owner, 2026-10-10). Exact:
  // Requests, under /workspaces/requests, is its own item.
  { href: "/workspaces", label: "Workspaces" },
  {
    href: "/submissions",
    label: "Submissions",
    permission: "submissions.create",
    section: "/submissions",
  },
  { href: "/reviews", label: "Reviews", permission: "submissions.review", section: "/reviews" },
  // Requests to join the workspaces they moderate (094), only while some wait.
  {
    href: "/workspaces/requests",
    label: "Requests",
    permission: "access_requests.answer",
    section: "/workspaces/requests",
    onlyWithCount: true,
  },
  { href: "/admin/users", label: "Admin", permission: "users.view", section: "/admin", end: true },
  // A workspace's admin: Admin opens their workspaces (092).
  {
    href: "/admin/workspaces",
    label: "Admin",
    permission: "members.manage",
    section: "/admin",
    end: true,
    unless: "users.view",
  },
  { href: DOCS_URL, label: "Docs", end: true, external: true },
];

export const navFor = (user: ShellUser | null, counts: Record<string, number> = {}): NavItem[] => {
  if (!user) return [];
  // A workspace permission shows the item when the user holds it in any workspace (091).
  return NAV.filter(
    (item) =>
      (!item.unless || !can(user, item.unless)) &&
      (!item.onlyWithCount || (counts[item.href] ?? 0) > 0) &&
      (!item.permission ||
        (item.permission in WORKSPACE_PERMISSIONS
          ? canInSome(user, item.permission as WorkspacePermission)
          : can(user, item.permission as Exclude<Permission, WorkspacePermission>))),
  );
};

export const isCurrent = (item: NavItem, path: string): boolean =>
  item.section
    ? [item.section].flat().some((section) => path === section || path.startsWith(`${section}/`))
    : item.href === path;
