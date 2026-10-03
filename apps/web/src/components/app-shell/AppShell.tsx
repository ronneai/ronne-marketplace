import { CircleUser } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import type { Theme } from "@/features/theme/theme";
import { Badge } from "../ui/Badge";
import { BrandLogo } from "../ui/BrandLogo";
import { MainNav } from "./MainNav";
import { navFor, type ShellUser } from "./nav";

const menuItem = "block w-full rounded-control px-3 py-1.5 text-left text-sm text-fg hover:bg-tint";

/**
 * The page frame (feature 032): a full-width header, which stays at the top as the page scrolls,
 * with the brand, role-aware navigation and the user menu; a content column at 72% of the width on
 * large screens (full width below 1024px); and a full-width footer. The theme switch sits in the header, next to the user menu. The user menu is
 * a native <details>, so it works without JavaScript. The (app) layout passes `signOutAction` (006).
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
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface pt-safe px-safe">
        <div className="flex h-14 items-center gap-1.5 px-3 sm:gap-6 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-fg outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <BrandLogo height={34} className="h-6 w-auto sm:h-[34px]" />
            <span className="hidden font-mono text-xs text-muted sm:inline">/ marketplace</span>
          </Link>
          <MainNav items={navFor(user)} counts={navCounts} />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle theme={theme} />
            {user ? (
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control px-2 py-1 text-sm text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus">
                  {/* The name, not the email (owner, 2026-09-27). On a phone an icon opens the menu. */}
                  <span className="hidden max-w-48 truncate text-sm sm:inline">{user.name}</span>
                  <CircleUser size={18} aria-label="Account menu" className="sm:hidden" />
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
                  {signOutAction ? (
                    <form action={signOutAction} className="border-t border-hairline pt-0.5">
                      <button type="submit" className={menuItem}>
                        Sign out
                      </button>
                    </form>
                  ) : null}
                </div>
              </details>
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
          <a href="https://github.com/ronneai/ronne-marketplace" className="hover:text-fg">
            github
          </a>
        </div>
      </footer>
    </div>
  );
};
