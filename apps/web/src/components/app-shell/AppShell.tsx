import Link from "next/link";
import type { ReactNode } from "react";
import { setThemeFromForm } from "@/features/theme/actions";
import { Badge } from "../ui/Badge";
import { BrandMark } from "../ui/BrandMark";
import { navFor, type ShellUser } from "./nav";

const menuItem = "block w-full rounded-control px-3 py-1.5 text-left text-sm text-fg hover:bg-tint";

/**
 * The page frame (feature 032): header with the brand, role-aware navigation and the user menu, a
 * 1024px content column, and the footer. The user menu is a native <details>, so it works without
 * JavaScript. Sign-out is wired by feature 006 through `signOutAction`.
 */
export function AppShell({
  user,
  current = "/",
  signOutAction,
  children,
}: {
  user: ShellUser | null;
  current?: string;
  signOutAction?: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-fg outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <BrandMark size={22} />
            <span className="text-base font-semibold tracking-[-0.01em]">ronne</span>
            <span className="font-mono text-xs text-muted">/ registry</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {navFor(user).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === current ? "page" : undefined}
                className="rounded-control px-3 py-1.5 text-sm text-muted hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {user ? (
            <details className="relative ml-auto">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control px-2 py-1 text-sm text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus">
                <span className="font-mono text-xs">{user.email}</span>
                {user.role !== "user" ? <Badge>{user.role}</Badge> : null}
              </summary>
              <div className="absolute right-0 z-10 mt-2 grid w-56 gap-0.5 rounded-panel border border-strong bg-surface p-1">
                <Link href="/account/password" className={menuItem}>
                  Account
                </Link>
                <Link href="/account/tokens" className={menuItem}>
                  Access tokens
                </Link>
                <form
                  action={setThemeFromForm}
                  className="grid grid-cols-3 gap-1 border-t border-hairline px-1 pt-1.5 pb-1"
                >
                  {(["system", "light", "dark"] as const).map((theme) => (
                    <button
                      key={theme}
                      type="submit"
                      name="theme"
                      value={theme}
                      className="rounded-control py-1 text-xs text-muted hover:bg-tint hover:text-fg"
                    >
                      {theme}
                    </button>
                  ))}
                </form>
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
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-4 py-4 font-mono text-xs text-muted sm:px-6">
          <span>ronne registry · open source (MIT)</span>
          <a href="https://github.com/ronneai/ronne-marketplace" className="hover:text-fg">
            github
          </a>
        </div>
      </footer>
    </div>
  );
}
