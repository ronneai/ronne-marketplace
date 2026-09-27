import { can, type Permission } from "@/server/domains/identity/models/permissions";

export type ShellUser = { email: string; role: "root" | "moderator" | "user" };

/** An item shows when it needs no permission, or the user holds it (the one permission map, 008). */
export type NavItem = { href: string; label: string; permission?: Permission };

/**
 * Top navigation. Only pages that exist are listed (feature 032): Catalogue, Reviews, Composer and
 * Releases join as their features land.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  // The audit log (007) is the first admin page; user admin (008) takes this link over.
  { href: "/admin/audit", label: "Admin", permission: "users.view" },
];

export function navFor(user: ShellUser | null): NavItem[] {
  if (!user) return [];
  return NAV.filter((item) => !item.permission || can(user, item.permission));
}
