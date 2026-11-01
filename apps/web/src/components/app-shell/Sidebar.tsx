"use client";

import { ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";
import { feedbackHref } from "@/features/feedback/href";
import { pagePathOf } from "@/server/domains/feedback/models/feedback";
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

/** The product's second word beside the brand: its name, the same in every language. */
const PRODUCT_SUFFIX = "/ marketplace";

const focus = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

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

const link = `flex items-center rounded-control transition-[min-height,padding] duration-200 motion-reduce:transition-none type-nav text-muted hover:bg-canvas hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-link ${focus}`;

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
  const t = useTranslations("shell");
  const tCommon = useTranslations("common");
  const path = usePathname() ?? "/";
  // Everything follows `folded`, so folding is a morph (owner, 2026-10-20): the width animates, and
  // the logo, the switcher, the items and the foot change shape in place, with no content swapped.
  const [folded, setFolded] = useState(initiallyFolded);
  // Send feedback (127) opens a dialog here; without JavaScript, and on a phone, it is a page.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const closeFeedback = () => {
    setFeedbackOpen(false);
    // The dialog is only in the page while open, so focus goes back to the link by hand.
    window.setTimeout(
      () => document.querySelector<HTMLElement>("[data-feedback-link]")?.focus(),
      0,
    );
  };
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    // biome-ignore lint/suspicious/noDocumentCookie: one plain preference, read by the server.
    document.cookie = sidebarCookie(next);
  };

  // One structure for both states, so folding is a morph: the label and the count fade as the item
  // narrows, and the icon stays where it is (the nav's padding puts it in the rail's middle).
  const entry = (item: NavItem) => {
    const count = counts[item.href] ?? 0;
    const label = t(`nav.${item.key}`);
    const name = count ? t("count.itemWaiting", { label, count }) : label;
    // Folded, the icon is centred in the rail's 39px (the border takes one of its 64: 10.5px each
    // side, the icon being 18px), and the
    // label and the count have no width at all: a faded label that still took room made the nav scroll.
    const className = `${link} relative ${folded ? "min-h-10 px-[10.5px]" : "min-h-9 px-3"}`;
    const body = (
      <>
        <NavIcon name={item.icon} />
        <span
          aria-hidden={folded}
          className={`min-w-0 flex-1 truncate transition-[max-width,margin,opacity] duration-200 motion-reduce:transition-none ${folded ? "ml-0 max-w-0 opacity-0" : "ml-3 max-w-56"}`}
        >
          {label}
        </span>
        {count ? (
          // Folded, the link's own name says "(3 waiting)"; open, the count is read as part of it.
          <span
            aria-hidden={folded}
            className={`shrink-0 overflow-hidden transition-[max-width,opacity] duration-200 motion-reduce:transition-none ${folded ? "max-w-0 opacity-0" : "max-w-12"}`}
          >
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
        aria-label={folded ? t("sidebar.itemNewTab", { label }) : undefined}
        title={folded ? label : undefined}
      >
        {body}
      </NewTabLink>
    ) : (
      <Link
        key={item.href}
        href={item.key === "feedback" ? feedbackHref(path) : item.href}
        data-feedback-link={item.key === "feedback" ? "" : undefined}
        onClick={
          item.key === "feedback"
            ? (event) => {
                event.preventDefault();
                setFeedbackOpen(true);
              }
            : undefined
        }
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
      aria-label={t("sidebar.label")}
      className={`sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r border-hairline bg-surface pt-safe pb-safe pl-safe lg:flex transition-[width] duration-200 ease-out motion-reduce:transition-none ${folded ? "w-16" : "w-64"}`}
    >
      {/* The fold button is a circle on the sidebar's edge, half over the page, at the logo's height
          (owner, 2026-10-20): the row is its positioning box, so it follows the logo's height. The
          sidebar sits above the top bar (z-40 over its z-30, 139), so the half over the page isn't
          hidden under it. */}
      <div className="w-full shrink-0 px-3 pt-4">
        <div className="relative flex h-[30px] items-center">
          <Link
            href="/"
            aria-label={t("sidebar.home")}
            className={`flex items-center text-fg ${focus}`}
          >
            <BrandLogo
              height={30}
              className="h-[30px] w-auto max-w-none transition-[clip-path,transform] duration-200 ease-out motion-reduce:transition-none"
              style={folded ? LOGO_FOLDED : LOGO_OPEN}
            />
            {/* The product's second word, in mono and grey, beside the brand while open (158); it fades as the rail folds.
                Decorative: the link's name already says where it goes. */}
            <span
              aria-hidden="true"
              className={`self-end overflow-hidden pb-[3px] font-mono text-xs leading-4 whitespace-nowrap text-muted/70 transition-[max-width,margin,opacity] duration-200 motion-reduce:transition-none ${folded ? "ml-0 max-w-0 opacity-0" : "ml-1.5 max-w-28"}`}
            >
              {PRODUCT_SUFFIX}
            </span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!folded}
            aria-controls="sidebar"
            aria-label={folded ? t("sidebar.unfold") : t("sidebar.fold")}
            title={folded ? t("sidebar.unfold") : t("sidebar.fold")}
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

      <div className="grid shrink-0 gap-3 px-3 pt-4">
        <WorkspaceSwitcher workspaces={workspaces} current={current} folded={folded} />
        {propose ? (
          <Link
            href={PROPOSE.href}
            aria-label={folded ? t(`nav.${PROPOSE.key}`) : undefined}
            title={folded ? t(`nav.${PROPOSE.key}`) : undefined}
            className={`flex w-full items-center justify-center rounded-control bg-accent-strong text-sm font-semibold text-on-accent transition-[height] duration-200 hover:opacity-90 motion-reduce:transition-none overflow-hidden ${focus} ${folded ? "h-10" : "h-9"}`}
          >
            <NavIcon name="propose" size={16} />
            <span
              aria-hidden={folded}
              className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity] duration-200 motion-reduce:transition-none ${folded ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-40"}`}
            >
              {t(`nav.${PROPOSE.key}`)}
            </span>
          </Link>
        ) : null}
      </div>

      <nav
        aria-label={t("sidebar.main")}
        className="mt-4 grid w-full min-h-0 flex-1 content-start gap-4 overflow-x-hidden overflow-y-auto px-3 pb-4"
      >
        {groupNav(items).map((group) => (
          // The group's heading folds away and a rule takes its place, both fading and sliding.
          <div
            key={group.id}
            className={`grid border-t first:border-0 transition-[gap,padding,border-color] duration-200 motion-reduce:transition-none ${folded ? "gap-1 border-hairline pt-4 first:pt-0" : "gap-0.5 border-transparent pt-0"}`}
          >
            <p
              aria-hidden={folded}
              className={`overflow-hidden whitespace-nowrap px-3 type-group-label uppercase text-muted transition-[max-height,opacity,padding] duration-200 motion-reduce:transition-none ${folded ? "max-h-0 pb-0 opacity-0" : "max-h-8 pb-1"}`}
            >
              {t(`groups.${group.id}`)}
            </p>
            {group.items.map(entry)}
          </div>
        ))}
      </nav>

      {/* The foot: the theme switch is a fixed box at the right of the account row, and moves up above
          the avatar when folded; the name fades, the account row narrows and the version collapses. */}
      <div
        className={`relative shrink-0 border-t border-hairline px-3 pb-3 transition-[padding] duration-200 motion-reduce:transition-none ${folded ? "pt-[56px]" : "pt-3"}`}
      >
        <DismissibleDetails
          className={`relative min-w-0 transition-[margin] duration-200 motion-reduce:transition-none ${folded ? "mr-0" : "mr-11"}`}
        >
          <summary
            aria-label={folded ? t("sidebar.accountOf", { name: user.name }) : undefined}
            title={user.name}
            className={`flex min-h-10 w-full cursor-pointer list-none items-center overflow-hidden rounded-control text-fg transition-[padding] duration-200 hover:bg-canvas motion-reduce:transition-none [&::-webkit-details-marker]:hidden ${focus} ${folded ? "px-1" : "px-1.5"}`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-strong text-on-accent">
              <UserRound size={16} aria-hidden />
            </span>
            <span
              aria-hidden={folded}
              className={`grid min-w-0 transition-[max-width,margin,opacity] duration-200 motion-reduce:transition-none ${folded ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-48"}`}
            >
              {/* The name, not the email (owner, 2026-09-27). */}
              <span className="truncate text-sm font-semibold">{user.name}</span>
              {user.role !== "user" ? (
                <span>
                  <Badge>{tCommon(`roles.${user.role}`)}</Badge>
                </span>
              ) : null}
            </span>
          </summary>
          <div
            className={`absolute bottom-full z-40 mb-2 grid w-56 gap-0.5 rounded-panel border border-strong bg-surface p-1 left-0`}
          >
            <div className="grid gap-0.5 border-b border-hairline px-3 pt-1.5 pb-2">
              <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <Link href="/account/password" className={menuItem}>
              {t("sidebar.account")}
            </Link>
            {signOutAction ? (
              <form action={signOutAction} className="border-t border-hairline pt-0.5">
                <button type="submit" className={menuItem}>
                  {t("sidebar.signOut")}
                </button>
              </form>
            ) : null}
          </div>
        </DismissibleDetails>
        <div
          className={`absolute z-10 transition-[top,right] duration-200 motion-reduce:transition-none ${folded ? "top-3 right-4" : "top-4 right-3"}`}
        >
          {appearance}
        </div>
        {version ? (
          <p
            aria-hidden={folded}
            className={`overflow-hidden px-1.5 text-xs whitespace-nowrap text-muted transition-[max-height,margin,opacity] duration-200 motion-reduce:transition-none ${folded ? "mt-0 max-h-0 opacity-0" : "mt-2 max-h-5"}`}
          >
            {t("sidebar.version", { version })}
          </p>
        ) : null}
      </div>
      {feedbackOpen ? (
        <FeedbackDialog open onClose={closeFeedback} page={pagePathOf(path)} />
      ) : null}
    </aside>
  );
};
