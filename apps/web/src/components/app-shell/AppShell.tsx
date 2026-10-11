import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import type { Theme } from "@/features/theme/theme";
import { BrandLogo } from "../ui/BrandLogo";
import { MobileMenu } from "./MobileMenu";
import { canPropose, navFor, type ShellUser, type ShellWorkspace } from "./nav";
import { Sidebar } from "./Sidebar";

/**
 * The page frame (032, 119). Signed in, from `lg`, the sidebar holds the navigation, the person
 * and the appearance switch, next to the content, which fills the rest of the width with 24px on
 * each side (owner, 2026-10-11: no cap, unlike the mocks' 1024px); below `lg`, a slim
 * header that stays at the top, with the logo and the Menu, whose sheet holds the same (066).
 * Signed out, the header has the logo and the appearance switch. A full-width footer closes the
 * content column. The (app) layout passes `signOutAction` (006).
 */
export const AppShell = ({
  user,
  theme = "light",
  signOutAction,
  navCounts,
  workspaces = [],
  folded = false,
  version,
  children,
}: {
  user: ShellUser | null;
  /** The theme cookie's value, for the appearance switch. */
  theme?: Theme;
  signOutAction?: () => Promise<void>;
  /** Numbers for nav items, by href. */
  navCounts?: Record<string, number>;
  /** The workspaces the switcher lists (119). */
  workspaces?: ShellWorkspace[];
  /** Whether the sidebar is folded, from its cookie (119). */
  folded?: boolean;
  /** The app's version, at the sidebar's foot. */
  version?: string;
  children: ReactNode;
}) => {
  const items = navFor(user, navCounts);
  const propose = canPropose(user);
  return (
    <div className="flex min-h-dvh">
      {user ? (
        <Sidebar
          user={user}
          items={items}
          counts={navCounts}
          workspaces={workspaces}
          folded={folded}
          propose={propose}
          appearance={<ThemeToggle theme={theme} />}
          signOutAction={signOutAction}
          version={version}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`sticky top-0 z-30 border-b border-hairline bg-surface pt-safe px-safe ${user ? "lg:hidden" : ""}`}
        >
          <div className="flex h-14 items-center gap-3 px-3 sm:px-6">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 text-fg outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
            >
              <BrandLogo height={34} className="h-6 w-auto sm:h-[34px]" />
              <span className="hidden font-mono text-xs text-muted sm:inline">/ marketplace</span>
            </Link>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {user ? (
                <MobileMenu
                  user={user}
                  items={items}
                  counts={navCounts}
                  workspaces={workspaces}
                  propose={propose}
                  appearance={<ThemeToggle theme={theme} />}
                  signOutAction={signOutAction}
                />
              ) : (
                <ThemeToggle theme={theme} />
              )}
            </div>
          </div>
        </header>
        {/* With `viewport-fit=cover`, a phone in landscape puts the notch over the sides (065). */}
        <div className="flex flex-1 flex-col px-safe">
          <main className="w-full flex-1 px-4 py-8 sm:px-6">{children}</main>
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
    </div>
  );
};
