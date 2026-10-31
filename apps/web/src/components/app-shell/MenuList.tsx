"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { feedbackHref } from "@/features/feedback/href";
import { Badge } from "../ui/Badge";
import { NewTabLink } from "../ui/NewTabLink";
import { NavCount } from "./NavCount";
import { NavIcon } from "./NavIcon";
import {
  groupNav,
  isCurrent,
  type NavItem,
  PROPOSE,
  type ShellUser,
  type ShellWorkspace,
} from "./nav";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const focus = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

const row = `flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm text-fg hover:bg-tint aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-link ${focus}`;

/**
 * What the Menu holds (066), the sidebar's contents below `lg` (119): the workspace switcher,
 * + Propose item, the links in their groups with their counts and the current page marked, then
 * the account part, the appearance switch and Sign out. Every row is 44px. The side sheet shows
 * it, and so does `/menu`, the page the Menu button links to without JavaScript.
 */
export const MenuList = ({
  user,
  items,
  counts = {},
  workspaces = [],
  current = null,
  propose = false,
  appearance,
  signOutAction,
  onNavigate,
}: {
  user: ShellUser;
  items: NavItem[];
  /** Numbers by href, as in the sidebar. */
  counts?: Record<string, number>;
  workspaces?: ShellWorkspace[];
  /** The current workspace (120), or null for All workspaces. */
  current?: string | null;
  /** Whether the user gets + Propose item. */
  propose?: boolean;
  /** The theme switch: a server component, so the shell renders it and passes it in. */
  appearance: ReactNode;
  signOutAction?: () => Promise<void>;
  /** Called when a link is followed: the sheet closes. The page passes nothing. */
  onNavigate?: () => void;
}) => {
  const t = useTranslations("shell");
  const tCommon = useTranslations("common");
  const path = usePathname() ?? "/";
  return (
    <>
      <div className="grid gap-3 pb-3">
        <WorkspaceSwitcher workspaces={workspaces} current={current} />
        {propose ? (
          <Link
            href={PROPOSE.href}
            onClick={onNavigate}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent-strong px-3.5 text-sm font-semibold text-on-accent hover:opacity-90 ${focus}`}
          >
            <NavIcon name="propose" size={16} />
            {t(`nav.${PROPOSE.key}`)}
          </Link>
        ) : null}
      </div>
      <nav aria-label={t("sidebar.main")} className="grid gap-3">
        {groupNav(items).map((group) => (
          <div key={group.id} className="grid gap-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t(`groups.${group.id}`)}
            </p>
            {group.items.map((item) =>
              item.external ? (
                <NewTabLink key={item.href} href={item.href} onClick={onNavigate} className={row}>
                  <NavIcon name={item.icon} />
                  {t(`nav.${item.key}`)}
                </NewTabLink>
              ) : (
                <Link
                  key={item.href}
                  href={item.key === "feedback" ? feedbackHref(path) : item.href}
                  onClick={onNavigate}
                  aria-current={isCurrent(item, path) ? "page" : undefined}
                  className={row}
                >
                  <NavIcon name={item.icon} />
                  {t(`nav.${item.key}`)}
                  {counts[item.href] ? <NavCount count={counts[item.href] ?? 0} /> : null}
                </Link>
              ),
            )}
          </div>
        ))}
      </nav>
      <div className="mt-3 grid gap-0.5 border-t border-hairline pt-3">
        <div className="grid gap-0.5 px-3 pb-2">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
            <span className="truncate">{user.name}</span>
            {user.role !== "user" ? <Badge>{tCommon(`roles.${user.role}`)}</Badge> : null}
          </p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <Link href="/account/password" onClick={onNavigate} className={row}>
          {t("sidebar.account")}
        </Link>
        <div className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm text-fg">
          {t("menu.appearance")}
          {appearance}
        </div>
        {signOutAction ? (
          <form action={signOutAction} className="border-t border-hairline pt-0.5">
            <button type="submit" className={row}>
              {t("sidebar.signOut")}
            </button>
          </form>
        ) : null}
      </div>
    </>
  );
};
