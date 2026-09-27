export type ShellUser = { email: string; role: "root" | "moderator" | "user" };

export type NavItem = { href: string; label: string; roles?: ShellUser["role"][] };

/**
 * Top navigation. Only pages that exist are listed (feature 032): Catalogue, Reviews, Composer and
 * Releases join as their features land.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  // The audit log (007) is the first admin page; user admin (008) takes this link over.
  { href: "/admin/audit", label: "Admin", roles: ["root"] },
];

export function navFor(user: ShellUser | null): NavItem[] {
  if (!user) return [];
  return NAV.filter((item) => !item.roles || item.roles.includes(user.role));
}
