"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "../ui/Badge";
import { NavCount } from "./MainNav";
import { isCurrent, type NavItem, type ShellUser } from "./nav";

const row =
  "flex min-h-11 w-full items-center rounded-control px-3 text-left text-sm text-fg hover:bg-tint aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-link outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * What the Menu holds (066): the nav links with their counts, the current page marked, then the
 * account part, the appearance switch and Sign out. Every row is 44px. The side sheet shows it,
 * and so does `/menu`, the page the Menu button links to without JavaScript.
 */
export const MenuList = ({
  user,
  items,
  counts = {},
  appearance,
  signOutAction,
  onNavigate,
}: {
  user: ShellUser;
  items: NavItem[];
  /** Numbers by href, as in MainNav. */
  counts?: Record<string, number>;
  /** The theme switch: a server component, so the shell renders it and passes it in. */
  appearance: ReactNode;
  signOutAction?: () => Promise<void>;
  /** Called when a link is followed: the sheet closes. The page passes nothing. */
  onNavigate?: () => void;
}) => {
  const path = usePathname() ?? "/";
  return (
    <>
      <nav aria-label="Main" className="grid gap-0.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isCurrent(item, path) ? "page" : undefined}
            className={row}
          >
            {item.label}
            {counts[item.href] ? <NavCount count={counts[item.href] ?? 0} /> : null}
          </Link>
        ))}
      </nav>
      <div className="mt-3 grid gap-0.5 border-t border-hairline pt-3">
        <div className="grid gap-0.5 px-3 pb-2">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
            <span className="truncate">{user.name}</span>
            {user.role !== "user" ? <Badge>{user.role}</Badge> : null}
          </p>
          <p className="truncate font-mono text-xs text-muted">{user.email}</p>
        </div>
        <Link href="/account/password" onClick={onNavigate} className={row}>
          Account
        </Link>
        <Link href="/account/tokens" onClick={onNavigate} className={row}>
          Access tokens
        </Link>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm text-fg">
          Appearance
          {appearance}
        </div>
        {signOutAction ? (
          <form action={signOutAction} className="border-t border-hairline pt-0.5">
            <button type="submit" className={row}>
              Sign out
            </button>
          </form>
        ) : null}
      </div>
    </>
  );
};
