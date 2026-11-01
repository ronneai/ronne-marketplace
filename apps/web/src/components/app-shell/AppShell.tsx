import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import type { Theme } from "@/features/theme/theme";
import { BrandLogo } from "../ui/BrandLogo";
import { MobileMenu } from "./MobileMenu";
import { canPropose, navFor, type ShellUser, type ShellWorkspace } from "./nav";
import { Sidebar } from "./Sidebar";

/**
 * The page frame (032, 119). Signed in, from `lg`, the sidebar holds the navigation, the person
 * and the appearance switch, next to the content, which fills the rest of the width with 24px on
 * each side (owner, 2026-10-11: no cap, unlike the mocks' 1024px). Above the content, never over
 * the sidebar, a slim header stays at the top: from `lg` it is the top bar (139), holding the
 * notification bell at its right; below `lg` it also has the logo and the Menu, whose sheet holds
 * what the sidebar does (066), with the bell beside it. Signed out, the header has the logo and the
 * appearance switch. A full-width footer closes the
 * content column. The (app) layout passes `signOutAction` (006).
 */
export const AppShell = ({
  user,
  theme = "light",
  signOutAction,
  navCounts,
  unread = 0,
  workspaces = [],
  current = null,
  folded = false,
  version,
  updateAvailable = null,
  notice = null,
  children,
}: {
  user: ShellUser | null;
  /** The theme cookie's value, for the appearance switch. */
  theme?: Theme;
  signOutAction?: () => Promise<void>;
  /** Numbers for nav items, by href. */
  navCounts?: Record<string, number>;
  /** How many notifications are unread (139): the bell's badge. */
  unread?: number;
  /** The workspaces the switcher lists (119). */
  workspaces?: ShellWorkspace[];
  /** The current workspace (120), or null for All workspaces. */
  current?: string | null;
  /** Whether the sidebar is folded, from its cookie (119). */
  folded?: boolean;
  /** The app's version, at the sidebar's foot. */
  version?: string;
  /** The newer version root has not installed (140), for the sidebar's mark. */
  updateAvailable?: string | null;
  /** The instance notice (124), drawn under the header and above the page; null when there is none. */
  notice?: ReactNode;
  children: ReactNode;
}) => {
  const t = useTranslations("shell");
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
          current={current}
          folded={folded}
          propose={propose}
          appearance={<ThemeToggle theme={theme} />}
          signOutAction={signOutAction}
          version={version}
          updateAvailable={updateAvailable}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-surface pt-safe px-safe">
          <div className="flex h-14 items-center gap-3 px-3 sm:px-6">
            <Link
              href="/"
              className={`flex shrink-0 items-center gap-2 text-fg outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus ${user ? "lg:hidden" : ""}`}
            >
              <BrandLogo height={34} className="h-6 w-auto sm:h-[34px]" />
              {/* biome-ignore lint/plugin: the product's name, the same in every language */}
              <span className="hidden text-xs text-muted sm:inline">/ marketplace</span>
            </Link>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {user ? (
                <>
                  <NotificationBell initialCount={unread} />
                  <div className="lg:hidden">
                    <MobileMenu
                      user={user}
                      items={items}
                      counts={navCounts}
                      workspaces={workspaces}
                      current={current}
                      propose={propose}
                      appearance={<ThemeToggle theme={theme} />}
                      signOutAction={signOutAction}
                    />
                  </div>
                </>
              ) : (
                <ThemeToggle theme={theme} />
              )}
            </div>
          </div>
        </header>
        {/* With `viewport-fit=cover`, a phone in landscape puts the notch over the sides (065). */}
        <div className="flex flex-1 flex-col px-safe">
          {notice ? <div className="px-4 pt-4 sm:px-6">{notice}</div> : null}
          <main className="w-full flex-1 px-4 py-8 sm:px-6">{children}</main>
        </div>
        <footer className="border-t border-hairline pb-safe px-safe">
          <div className="flex flex-wrap justify-between gap-2 px-4 py-4 text-xs text-muted sm:px-6">
            <span>{t("footer.openSource")}</span>
            <a
              href="https://github.com/ronneai/ronne-marketplace"
              className="touch-hit hover:text-fg"
            >
              {/* biome-ignore lint/plugin: GitHub's name, the same in every language */}
              github
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};
