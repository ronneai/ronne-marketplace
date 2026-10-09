import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import type { Theme } from "@/features/theme/theme";
import { Badge } from "../ui/Badge";
import { BrandLogo } from "../ui/BrandLogo";
import { DismissibleDetails } from "./DismissibleDetails";
import { MainNav } from "./MainNav";
import { MobileMenu } from "./MobileMenu";
import { navFor, type ShellUser } from "./nav";

const menuItem =
  "block w-full rounded-control px-3 py-1.5 pointer-coarse:py-3 text-left text-sm text-fg hover:bg-tint";

/**
 * The page frame (feature 032): a full-width header, which stays at the top as the page scrolls,
 * with the brand, role-aware navigation and the user menu; a content column at 72% of the width on
 * large screens (full width below 1024px); and a full-width footer. The theme switch sits in the
 * header, next to the user menu. The user menu is a native <details>, so it works without
 * JavaScript; with it, it closes on a click outside, Esc and a change of page (066). Below `lg` a
 * signed-in header is the logo and the Menu, whose sheet holds all of that (066). The (app) layout
 * passes `signOutAction` (006).
 */
export const AppShell = ({
  user,
  theme = "light",
  signOutAction,
  navCounts,
  children,
}: {
  user: ShellUser | null;
  /** The theme cookie's value, for the header's theme switch. */
  theme?: Theme;
  signOutAction?: () => Promise<void>;
  /** Numbers for nav items, by href (MainNav). */
  navCounts?: Record<string, number>;
  children: ReactNode;
}) => {
  const items = navFor(user, navCounts);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface pt-safe px-safe">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-6 lg:gap-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-fg outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <BrandLogo height={34} className="h-6 w-auto sm:h-[34px]" />
            <span className="hidden font-mono text-xs text-muted sm:inline">/ marketplace</span>
          </Link>
          <MainNav items={items} counts={navCounts} />
          {user ? (
            <div className="ml-auto lg:hidden">
              <MobileMenu
                user={user}
                items={items}
                counts={navCounts}
                appearance={<ThemeToggle theme={theme} />}
                signOutAction={signOutAction}
              />
            </div>
          ) : null}
          <div
            className={`ml-auto shrink-0 items-center gap-2 ${user ? "hidden lg:flex" : "flex"}`}
          >
            <ThemeToggle theme={theme} />
            {user ? (
              <DismissibleDetails className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control px-2 py-1 pointer-coarse:min-h-11 text-sm text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus">
                  {/* The name, not the email (owner, 2026-09-27). */}
                  <span className="max-w-48 truncate text-sm">{user.name}</span>
                  {user.role !== "user" ? <Badge>{user.role}</Badge> : null}
                </summary>
                <div className="absolute right-0 z-10 mt-2 grid w-56 gap-0.5 rounded-panel border border-strong bg-surface p-1">
                  <div className="grid gap-0.5 border-b border-hairline px-3 pt-1.5 pb-2">
                    <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
                    <p className="truncate font-mono text-xs text-muted">{user.email}</p>
                  </div>
                  <Link href="/account/password" className={menuItem}>
                    Account
                  </Link>
                  <Link href="/account/tokens" className={menuItem}>
                    Access tokens
                  </Link>
                  <Link href="/workspaces" className={menuItem}>
                    Workspaces
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
            ) : null}
          </div>
        </div>
      </header>
      {/* With `viewport-fit=cover`, a phone in landscape puts the notch over the sides (065). */}
      <div className="flex flex-1 flex-col px-safe">
        <main className="mx-auto w-full flex-1 px-4 py-8 sm:px-6 lg:w-[72%] lg:px-0">
          {children}
        </main>
      </div>
      <footer className="border-t border-hairline pb-safe px-safe">
        <div className="flex flex-wrap justify-between gap-2 px-4 py-4 font-mono text-xs text-muted sm:px-6">
          <span>ronne marketplace · open source (MIT)</span>
          <a
            href="https://github.com/ronneai/ronne-marketplace"
            className="touch-hit hover:text-fg"
          >
            github
          </a>
        </div>
      </footer>
    </div>
  );
};
