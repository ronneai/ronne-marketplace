"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Badge } from "../ui/Badge";
import { Dialog } from "../ui/Dialog";
import { NavCount } from "./MainNav";
import { isCurrent, type NavItem, type ShellUser } from "./nav";

/** Tailwind's `lg`: from here the header has room for the strip, so the menu isn't used. */
export const DESKTOP_QUERY = "(min-width: 64rem)";

const row =
  "flex min-h-11 w-full items-center rounded-control px-3 text-left text-sm text-fg hover:bg-tint aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-link outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * The header's menu on phones and tablets (066): below `lg` the header is the logo and this
 * button, which opens a side sheet with the navigation, the account links, the appearance switch
 * and Sign out. Every row is 44px. The button shows the Reviews count, the one where someone else
 * is waiting.
 *
 * The sheet closes on a link, Esc, a tap outside, a change of page (back and forward too) and when
 * the window grows to `lg`. Focus goes back to the button: the native dialog would do it, but
 * Safari doesn't focus a button on a click, so there it had nothing to go back to.
 */
export const MobileMenu = ({
  user,
  items,
  counts = {},
  appearance,
  signOutAction,
}: {
  user: ShellUser;
  items: NavItem[];
  /** Numbers by href, as in MainNav. */
  counts?: Record<string, number>;
  /** The theme switch: a server component, so the shell renders it and passes it in. */
  appearance: ReactNode;
  signOutAction?: () => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const path = usePathname() ?? "/";
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on every change of page.
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  const waiting = counts["/reviews"];
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-2 rounded-control border border-hairline px-3 text-sm text-fg hover:border-strong outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Menu size={18} aria-hidden />
        Menu
        {waiting ? <NavCount count={waiting} /> : null}
      </button>
      <Dialog open={open} onClose={close} title="Menu" size="side" closeOnBackdrop>
        <nav aria-label="Main" className="grid gap-0.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
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
          <Link href="/account/password" onClick={close} className={row}>
            Account
          </Link>
          <Link href="/account/tokens" onClick={close} className={row}>
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
      </Dialog>
    </>
  );
};
