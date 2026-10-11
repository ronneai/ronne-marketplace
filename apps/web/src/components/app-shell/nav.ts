import { DOCS_URL } from "@/components/help/topics";
import {
  can,
  canInSomeShared,
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
  /** Their personal workspace (114): owning it puts nothing in the nav. */
  personal?: string | null;
};

/** A workspace in the switcher (119): one the user is a member of, opened by its name. */
export type ShellWorkspace = {
  name: string;
  role: "admin" | "moderator" | "user";
  personal: boolean;
};

/** The sidebar's groups (119), in order. */
export const NAV_GROUPS = [
  { id: "discover", label: "Discover" },
  { id: "governance", label: "Governance & reviews" },
  { id: "tools", label: "Tools" },
] as const;

export type NavGroup = (typeof NAV_GROUPS)[number]["id"];

/** The icon names the sidebar knows (119): strings, since nav items cross to client components. */
export type NavIcon =
  | "home"
  | "catalogue"
  | "workspaces"
  | "requests"
  | "reviews"
  | "submissions"
  | "users"
  | "audit"
  | "settings"
  | "docs"
  | "tokens"
  | "propose";

/** An item shows when it needs no permission, or the user holds it (the one permission map, 008). */
export type NavItem = {
  href: string;
  label: string;
  /** The sidebar's group it's under (119). */
  group: NavGroup;
  /** Its icon, the only thing shown when the sidebar is folded (119). */
  icon: NavIcon;
  permission?: Permission;
  /** The item is current on every path under this one (or these), for example "/admin/users". */
  section?: string | string[];
  /**
   * Also current under paths like this, `*` standing for one segment: a workspace's item pages are
   * the catalogue's (118). A string, since nav items are passed to client components.
   */
  pattern?: string;
  /** Another site, opened in a new tab: Documentation, on the website (088). */
  external?: true;
  /** Never current under these, `*` standing for one segment: other items' pages in its section. */
  not?: string[];
  /** Shown only while its count is above 0: Requests (094), for moderators of a quiet workspace. */
  onlyWithCount?: true;
};

/**
 * The navigation, in the sidebar from `lg` and in the Menu below (119). Only pages that exist are
 * listed (feature 032). Catalogue (018) is current on item pages too. Root's Admin pages are three
 * links rather than one (owner, 2026-10-11), and Admin keeps its own tabs. Documentation opens the
 * website in a new tab (088). Access tokens are under Tools, as CLI & tokens.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", group: "discover", icon: "home" },
  {
    href: "/catalogue",
    label: "Catalogue",
    group: "discover",
    icon: "catalogue",
    section: ["/catalogue", "/items"],
    pattern: "/workspaces/*/items",
  },
  // Every signed-in user's workspaces and joining (094). Current on a workspace's page too (115),
  // but not on Requests or a workspace's items, other items' pages.
  {
    href: "/workspaces",
    label: "Workspaces",
    group: "discover",
    icon: "workspaces",
    section: "/workspaces",
    not: ["/workspaces/requests", "/workspaces/*/items"],
  },
  // Requests to join the workspaces they moderate (094) and scope moves (115), only while some wait.
  {
    href: "/workspaces/requests",
    label: "Requests",
    group: "discover",
    icon: "requests",
    permission: "access_requests.answer",
    section: "/workspaces/requests",
    onlyWithCount: true,
  },
  {
    href: "/reviews",
    label: "Reviews",
    group: "governance",
    icon: "reviews",
    permission: "submissions.review",
    section: "/reviews",
  },
  {
    href: "/submissions",
    label: "Submissions",
    group: "governance",
    icon: "submissions",
    permission: "submissions.create",
    section: "/submissions",
  },
  // Root's alone (115): a workspace's admins manage it from its page under Workspaces.
  {
    href: "/admin/users",
    label: "Users",
    group: "governance",
    icon: "users",
    permission: "users.view",
    section: "/admin/users",
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    group: "governance",
    icon: "audit",
    permission: "users.view",
    section: "/admin/audit",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    group: "governance",
    icon: "settings",
    permission: "users.view",
    section: "/admin/settings",
  },
  { href: DOCS_URL, label: "Documentation", group: "tools", icon: "docs", external: true },
  { href: "/account/tokens", label: "CLI & tokens", group: "tools", icon: "tokens" },
];

/** + Propose item, above the groups (119): a new item, for those who can submit. */
export const PROPOSE: NavItem = {
  href: "/submissions/new",
  label: "Propose item",
  group: "governance",
  icon: "propose",
  permission: "submissions.create",
};

const allowed = (user: ShellUser, item: NavItem) =>
  // A workspace permission shows the item when the user holds it in any shared workspace (091,
  // 114): their own personal workspace doesn't count.
  !item.permission ||
  (item.permission in WORKSPACE_PERMISSIONS
    ? canInSomeShared(user, item.permission as WorkspacePermission)
    : can(user, item.permission as Exclude<Permission, WorkspacePermission>));

/** Whether the user gets + Propose item. */
export const canPropose = (user: ShellUser | null): boolean => !!user && allowed(user, PROPOSE);

/** The groups that have an item, each with its items, in order: a heading shows only with links. */
export const groupNav = (items: NavItem[]) =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length > 0);

export const navFor = (user: ShellUser | null, counts: Record<string, number> = {}): NavItem[] => {
  if (!user) return [];
  return NAV.filter(
    (item) => (!item.onlyWithCount || (counts[item.href] ?? 0) > 0) && allowed(user, item),
  );
};

/** Whether `path` is `pattern` or under it, each `*` matching one segment. */
const under = (pattern: string, path: string) => {
  const want = pattern.split("/");
  const have = path.split("/");
  return have.length >= want.length && want.every((part, i) => part === "*" || part === have[i]);
};

export const isCurrent = (item: NavItem, path: string): boolean =>
  !(item.not ?? []).some((pattern) => under(pattern, path)) &&
  ((item.pattern !== undefined && under(item.pattern, path)) ||
    (item.section
      ? [item.section].flat().some((section) => path === section || path.startsWith(`${section}/`))
      : item.href === path));
