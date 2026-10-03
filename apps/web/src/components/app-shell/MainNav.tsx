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
      className={`${item.hideOnPhone ? "hidden sm:inline-block " : ""}shrink-0 whitespace-nowrap rounded-control px-2 py-1.5 pointer-coarse:py-3 text-sm text-muted sm:px-3 hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-link outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus`}
    >
      {item.label}
      {counts[item.href] ? (
        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-strong px-1 font-mono text-[10px] font-semibold text-on-accent">
          {counts[item.href]}
          <span className="sr-only"> waiting</span>
        </span>
      ) : null}
    </Link>
  );
  return (
    // `relative`, so the strip also clips the counts' screen-reader text (absolutely positioned),
    // which otherwise widened the whole page on a phone (065).
    <nav
      aria-label="Main"
      className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
    >
      {items.filter((item) => !item.end).map(link)}
      <span className="ml-auto" />
      {items.filter((item) => item.end).map(link)}
    </nav>
  );
};
