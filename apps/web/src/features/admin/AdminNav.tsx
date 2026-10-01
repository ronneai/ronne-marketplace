"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/scopes", label: "Scopes" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
];

/**
 * The admin area's own navigation (feature 008), shared by every /admin page. A client component,
 * so the current tab follows navigation: the admin layout stays mounted between its pages.
 */
export const AdminNav = () => {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Admin" className="mb-6 flex gap-1 border-b border-hairline">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={path === item.href || path.startsWith(`${item.href}/`) ? "page" : undefined}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg aria-[current=page]:border-accent aria-[current=page]:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
};
