import { can, type Permission } from "@/server/domains/identity/models/permissions";

export type ShellUser = { name: string; email: string; role: "root" | "moderator" | "user" };

/** An item shows when it needs no permission, or the user holds it (the one permission map, 008). */
export type NavItem = {
  href: string;
  label: string;
  permission?: Permission;
  /** The item is current on every path under this one (or these), for example "/admin". */
  section?: string | string[];
  /** Hidden on phones, to fit the header; the logo already links home. */
  hideOnPhone?: boolean;
  /** Shown at the right of the header, next to the appearance switch: Admin and Docs. */
  end?: true;
};

/**
 * Top navigation. Only pages that exist are listed (feature 032): Composer and Releases join as
 * their features land. Catalogue (018) is current on item pages too. Admin and Docs (033) sit at
 * the right, before the appearance switch (owner's request, 2026-09-28).
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Home", hideOnPhone: true },
  { href: "/catalogue", label: "Catalogue", section: ["/catalogue", "/items"] },
  {
    href: "/submissions",
    label: "Submissions",
    permission: "submissions.create",
    section: "/submissions",
  },
  { href: "/reviews", label: "Reviews", permission: "submissions.review", section: "/reviews" },
  { href: "/scopes", label: "Scopes" },
  { href: "/admin/users", label: "Admin", permission: "users.view", section: "/admin", end: true },
  { href: "/docs", label: "Docs", section: "/docs", end: true },
];

export const navFor = (user: ShellUser | null): NavItem[] => {
  if (!user) return [];
  return NAV.filter((item) => !item.permission || can(user, item.permission));
};

export const isCurrent = (item: NavItem, path: string): boolean =>
  item.section
    ? [item.section].flat().some((section) => path === section || path.startsWith(`${section}/`))
    : item.href === path;
