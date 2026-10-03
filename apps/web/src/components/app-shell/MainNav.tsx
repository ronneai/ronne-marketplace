"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent, type NavItem } from "./nav";

/** A count next to a nav item or on the Menu button: how many are waiting. */
export const NavCount = ({ count }: { count: number }) => (
  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-strong px-1 text-[10px] font-semibold text-on-accent">
    {count}
    <span className="sr-only"> waiting</span>
  </span>
);

/**
 * The header's navigation. A client component: layouts stay mounted when you navigate, so the
 * current item has to come from the live path (`usePathname`), not from the first request. The
 * current item uses the link colour as well as the tint: in the dark theme, the tint is the same
 * navy as the header, so on its own it didn't show. It shows from `lg`; below, the header has the
 * Menu instead (066).
 */
export const MainNav = ({
  items,
  counts = {},
}: {
  items: NavItem[];
  /** A number shown next to an item, by its href: the Needs review count on Reviews (014). */
  counts?: Record<string, number>;
}) => {
  const path = usePathname() ?? "/";
  const link = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={isCurrent(item, path) ? "page" : undefined}
      className="shrink-0 whitespace-nowrap rounded-control px-3 py-1.5 pointer-coarse:py-3 text-sm text-muted hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-link outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      {item.label}
      {counts[item.href] ? <NavCount count={counts[item.href] ?? 0} /> : null}
    </Link>
  );
  return (
    // `relative`, so the strip also clips the counts' screen-reader text (absolutely positioned),
    // which otherwise widened the whole page on a phone (065).
    <nav
      aria-label="Main"
      className="relative hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] lg:flex"
    >
      {items.filter((item) => !item.end).map(link)}
      <span className="ml-auto" />
      {items.filter((item) => item.end).map(link)}
    </nav>
  );
};
