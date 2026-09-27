import { can, type Permission } from "@/server/domains/identity/models/permissions";

export type ShellUser = { email: string; role: "root" | "moderator" | "user" };

/** An item shows when it needs no permission, or the user holds it (the one permission map, 008). */
export type NavItem = {
  href: string;
  label: string;
  permission?: Permission;
  /** The item is current on every path under this one, for example "/admin". */
  section?: string;
};

/**
 * Top navigation. Only pages that exist are listed (feature 032): Catalogue, Reviews, Composer and
 * Releases join as their features land.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/admin/users", label: "Admin", permission: "users.view", section: "/admin" },
];

export const navFor = (user: ShellUser | null): NavItem[] => {
  if (!user) return [];
  return NAV.filter((item) => !item.permission || can(user, item.permission));
};

export const isCurrent = (item: NavItem, path: string): boolean =>
  item.section ? path === item.section || path.startsWith(`${item.section}/`) : item.href === path;
