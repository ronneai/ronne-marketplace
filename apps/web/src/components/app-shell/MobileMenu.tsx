"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { NavCount } from "./MainNav";
import { MenuList } from "./MenuList";
import type { NavItem, ShellUser } from "./nav";

/** Tailwind's `lg`: from here the header has room for the strip, so the menu isn't used. */
export const DESKTOP_QUERY = "(min-width: 64rem)";

const buttonClasses =
  "flex min-h-11 items-center gap-2 rounded-control border border-hairline px-3 text-sm text-fg hover:border-strong outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * The header's menu on phones and tablets (066): below `lg` the header is the logo and this
 * button, which opens a side sheet with the navigation, the account links, the appearance switch
 * and Sign out. Every row is 44px. The button shows the Reviews count, the one where someone else
 * is waiting.
 *
 * The sheet closes on a link, Esc, a tap outside, a change of page (back and forward too) and when
 * the window grows to `lg`. Without JavaScript the button is a link to `/menu`, the same list as a
 * page. Focus goes back to the button: the native dialog would do it, but
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
  // Until the script runs, Menu is a link to /menu; then it's a button that opens the sheet.
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => setEnhanced(true), []);

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
  const label = (
    <>
      <Menu size={18} aria-hidden />
      Menu
      {waiting ? <NavCount count={waiting} /> : null}
    </>
  );
  return (
    <>
      {enhanced ? (
        <button
          ref={button}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={buttonClasses}
        >
          {label}
        </button>
      ) : (
        <Link href="/menu" className={buttonClasses}>
          {label}
        </Link>
      )}
      <Dialog open={open} onClose={close} title="Menu" size="side" closeOnBackdrop>
        <MenuList
          user={user}
          items={items}
          counts={counts}
          appearance={appearance}
          signOutAction={signOutAction}
          onNavigate={close}
        />
      </Dialog>
    </>
  );
};
