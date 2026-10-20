"use client";

import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "../ui/Badge";
import { BrandLogo } from "../ui/BrandLogo";
import { NewTabLink } from "../ui/NewTabLink";
import { DismissibleDetails } from "./DismissibleDetails";
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
import { sidebarCookie } from "./sidebar-cookie";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const focus = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** How long folding and unfolding take: the width's transition, in `Sidebar`'s class `duration-200`. */
const FOLD_MS = 200;

/**
 * Folding keeps the logo and wipes the wordmark away, so the mark slides to the middle of the rail
 * instead of the logo being swapped for another picture (owner, 2026-10-20). These are the logo's
 * own numbers at 30px high (measured: it is 105.5px wide, its mark from 3.2 to 18.4px) and the
 * rail's inner width (64px less the padding). The sidebar e2e test checks the mark is centred.
 */
const LOGO_W = 105.5;
const MARK_LEFT = 3.2;
const MARK_RIGHT = 18.4;
const RAIL_INNER = 40;
const LOGO_FOLDED = {
  clipPath: `inset(0 ${LOGO_W - MARK_RIGHT - 1.5}px 0 0)`,
  transform: `translateX(${RAIL_INNER / 2 - (MARK_LEFT + MARK_RIGHT) / 2}px)`,
};
const LOGO_OPEN = { clipPath: "inset(0 0px 0 0)", transform: "translateX(0px)" };

const link = `flex items-center gap-3 rounded-control transition-[min-height] duration-200 motion-reduce:transition-none text-sm text-muted hover:bg-canvas hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-link ${focus}`;

const menuItem = `block w-full rounded-control px-3 py-1.5 text-left text-sm text-fg hover:bg-tint ${focus}`;

/**
 * The sidebar (119), from `lg`: the logo and the fold button, the workspace switcher, + Propose
 * item, the links in their groups, and at the foot the person (with Account and Sign out), the
 * appearance switch and the version. Folded, it's a 64px rail of icons, each named by its
 * `aria-label` and `title`, a dot where a count waits. The choice is kept in a cookie, which the
 * shell reads, so the next page renders folded at once. A client component: the current link
 * comes from the live path, since layouts stay mounted when you navigate.
 */
export const Sidebar = ({
  user,
  items,
  counts = {},
  workspaces,
  current = null,
  folded: initiallyFolded = false,
  propose,
  appearance,
  signOutAction,
  version,
}: {
  user: ShellUser;
  items: NavItem[];
  /** Numbers by href: Reviews (014) and Requests (094). */
  counts?: Record<string, number>;
  workspaces: ShellWorkspace[];
  /** The current workspace (120), or null for All workspaces. */
  current?: string | null;
  /** The fold cookie's value, read by the shell. */
  folded?: boolean;
  /** Whether the user gets + Propose item. */
  propose: boolean;
  /** The theme switch: a server component, so the shell renders it and passes it in. */
  appearance: ReactNode;
  signOutAction?: () => Promise<void>;
  /** The app's version, shown at the foot. */
  version?: string;
}) => {
  const path = usePathname() ?? "/";
  // `folded` is where the sidebar is going: its width, the chevron and the cookie. `railed` is what
  // it shows: folding keeps the full content until the width has shrunk (the labels are cut off by
  // the narrowing edge, not swapped out under it), and unfolding shows it at once, revealed by the
  // growing edge. `moving` clips the content for the length of the transition.
  const [folded, setFolded] = useState(initiallyFolded);
  const [railed, setRailed] = useState(initiallyFolded);
  const [moving, setMoving] = useState(false);
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    // biome-ignore lint/suspicious/noDocumentCookie: one plain preference, read by the server.
    document.cookie = sidebarCookie(next);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRailed(next);
      return;
    }
    setMoving(true);
    if (!next) setRailed(false);
  };
  useEffect(() => {
    if (!moving) return;
    const done = setTimeout(() => {
      setRailed(folded);
      setMoving(false);
    }, FOLD_MS + 20);
    return () => clearTimeout(done);
  }, [moving, folded]);
  const clip = moving ? "overflow-x-hidden" : "";

  // One structure for both states, so folding is a morph: the label and the count fade as the item
  // narrows, and the icon stays where it is (the nav's padding puts it in the rail's middle).
  const entry = (item: NavItem) => {
    const count = counts[item.href] ?? 0;
    const name = count ? `${item.label} (${count} waiting)` : item.label;
    const className = `${link} relative px-3 ${folded ? "min-h-10" : "min-h-9"}`;
    const fade = `transition-opacity duration-200 motion-reduce:transition-none ${folded ? "opacity-0" : ""}`;
    const body = (
      <>
        <NavIcon name={item.icon} />
        <span aria-hidden={folded} className={`min-w-0 flex-1 truncate ${fade}`}>
          {item.label}
        </span>
        {count ? (
          <span aria-hidden className={`shrink-0 ${fade}`}>
            <NavCount count={count} />
          </span>
        ) : null}
        {count ? (
          <span
            aria-hidden
            className={`absolute top-1.5 right-1.5 size-2 rounded-full bg-accent transition-opacity duration-200 motion-reduce:transition-none ${folded ? "" : "opacity-0"}`}
          />
        ) : null}
      </>
    );
    return item.external ? (
      <NewTabLink
        key={item.href}
        href={item.href}
        // Folded, the rail has no room for the new-tab mark; the name still says it.
        className={folded ? `${className} [&>svg:nth-of-type(2)]:hidden` : className}
        aria-label={folded ? `${item.label} (opens in a new tab)` : undefined}
        title={folded ? item.label : undefined}
      >
        {body}
      </NewTabLink>
    ) : (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isCurrent(item, path) ? "page" : undefined}
        aria-label={folded ? name : undefined}
        title={folded ? name : undefined}
        className={className}
      >
        {body}
      </Link>
    );
  };

  return (
    <aside
      id="sidebar"
      aria-label="Sidebar"
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-hairline bg-surface pt-safe pb-safe pl-safe lg:flex transition-[width] duration-200 ease-out motion-reduce:transition-none ${folded ? "w-16" : "w-64"} ${railed ? "items-center" : ""}`}
    >
      {/* The fold button is a circle on the sidebar's edge, half over the page, at the logo's height
          (owner, 2026-10-20): the row is its positioning box, so it follows the logo's height. */}
      <div className="w-full shrink-0 px-3 pt-4">
        <div className="relative flex h-[30px] items-center">
          <Link href="/" aria-label="Home" className={`flex items-center text-fg ${focus}`}>
            <BrandLogo
              height={30}
              className="h-[30px] w-auto max-w-none transition-[clip-path,transform] duration-200 ease-out motion-reduce:transition-none"
              style={folded ? LOGO_FOLDED : LOGO_OPEN}
            />
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!folded}
            aria-controls="sidebar"
            aria-label={folded ? "Unfold the sidebar" : "Fold the sidebar"}
            title={folded ? "Unfold the sidebar" : "Fold the sidebar"}
            className={`touch-hit absolute top-1/2 -right-3 z-40 flex size-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-hairline bg-surface text-muted hover:border-strong hover:text-fg ${focus}`}
          >
            {folded ? (
              <ChevronRight size={14} aria-hidden />
            ) : (
              <ChevronLeft size={14} aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div
        className={`grid shrink-0 gap-3 px-3 pt-4 ${clip} ${railed ? "justify-items-center" : ""}`}
      >
        <WorkspaceSwitcher workspaces={workspaces} current={current} folded={railed} />
        {propose ? (
          <Link
            href={PROPOSE.href}
            aria-label={folded ? PROPOSE.label : undefined}
            title={folded ? PROPOSE.label : undefined}
            className={`flex w-full items-center justify-center rounded-control bg-accent-strong text-sm font-semibold text-on-accent transition-[height] duration-200 hover:opacity-90 motion-reduce:transition-none ${focus} ${folded ? "h-10" : "h-9"}`}
          >
            <NavIcon name="propose" size={16} />
            <span
              aria-hidden={folded}
              className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-200 motion-reduce:transition-none ${folded ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-40"}`}
            >
              {PROPOSE.label}
            </span>
          </Link>
        ) : null}
      </div>

      <nav
        aria-label="Main"
        className="mt-4 grid w-full min-h-0 flex-1 content-start gap-4 overflow-y-auto px-3 pb-4"
      >
        {groupNav(items).map((group) => (
          // The group's heading folds away and a rule takes its place, both fading and sliding.
          <div
            key={group.id}
            className={`grid border-t first:border-0 transition-[gap,padding,border-color] duration-200 motion-reduce:transition-none ${folded ? "gap-1 border-hairline pt-4 first:pt-0" : "gap-0.5 border-transparent pt-0"}`}
          >
            <p
              aria-hidden={folded}
              className={`overflow-hidden whitespace-nowrap px-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted transition-[max-height,opacity,padding] duration-200 motion-reduce:transition-none ${folded ? "max-h-0 pb-0 opacity-0" : "max-h-8 pb-1"}`}
            >
              {group.label}
            </p>
            {group.items.map(entry)}
          </div>
        ))}
      </nav>

      <div
        className={`grid shrink-0 gap-2 border-t border-hairline px-3 py-3 ${clip} ${railed ? "w-full justify-items-center" : ""}`}
      >
        <div className={`flex gap-2 ${railed ? "flex-col-reverse items-center" : "items-center"}`}>
          <DismissibleDetails className="relative min-w-0 flex-1">
            <summary
              aria-label={railed ? `${user.name}, your account` : undefined}
              title={user.name}
              className={`flex cursor-pointer list-none items-center gap-2 rounded-control text-fg hover:bg-canvas [&::-webkit-details-marker]:hidden ${focus} ${railed ? "size-10 justify-center" : "min-h-10 px-1.5"}`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-strong text-on-accent">
                <UserRound size={16} aria-hidden />
              </span>
              {railed ? null : (
                <span className="grid min-w-0">
                  {/* The name, not the email (owner, 2026-09-27). */}
                  <span className="truncate text-sm font-semibold">{user.name}</span>
                  {user.role !== "user" ? (
                    <span>
                      <Badge>{user.role}</Badge>
                    </span>
                  ) : null}
                </span>
              )}
            </summary>
            <div
              className={`absolute bottom-full z-40 mb-2 grid w-56 gap-0.5 rounded-panel border border-strong bg-surface p-1 left-0`}
            >
              <div className="grid gap-0.5 border-b border-hairline px-3 pt-1.5 pb-2">
                <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
                <p className="truncate font-mono text-xs text-muted">{user.email}</p>
              </div>
              <Link href="/account/password" className={menuItem}>
                Account
              </Link>
              {signOutAction ? (
                <form action={signOutAction} className="border-t border-hairline pt-0.5">
                  <button type="submit" className={menuItem}>
                    Sign out
                  </button>
                </form>
              ) : null}
            </div>
          </DismissibleDetails>
          {appearance}
        </div>
        {version && !railed ? (
          <p className="px-1.5 font-mono text-xs text-muted">ronne marketplace v{version}</p>
        ) : null}
      </div>
    </aside>
  );
};
