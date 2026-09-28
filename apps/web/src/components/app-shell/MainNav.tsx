"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent, type NavItem } from "./nav";

/**
 * The header's navigation. A client component: layouts stay mounted when you navigate, so the
 * current item has to come from the live path (`usePathname`), not from the first request. The
 * current item uses the link colour as well as the tint: in the dark theme, the tint is the same
 * navy as the header, so on its own it didn't show. On a narrow phone the items scroll sideways,
 * so the theme switch and account menu stay in view.
 */
export const MainNav = ({ items }: { items: NavItem[] }) => {
  const path = usePathname() ?? "/";
  return (
    <nav
      aria-label="Main"
      className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isCurrent(item, path) ? "page" : undefined}
          className={`${item.hideOnPhone ? "hidden sm:inline-block " : ""}shrink-0 whitespace-nowrap rounded-control px-2 py-1.5 text-sm text-muted sm:px-3 hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-link outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
};
