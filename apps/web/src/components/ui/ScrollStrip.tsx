"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { fadeClass, scrollToShow } from "./scroll-strip";

/** The current tab: a link's `aria-current`, or a tab's `aria-selected`. */
const CURRENT = '[aria-current="page"], [aria-selected="true"]';

/** Each tab in a strip: at least 44px tall on a coarse pointer, its label centred (066). */
export const stripTab =
  "inline-flex shrink-0 items-center whitespace-nowrap pointer-coarse:min-h-11";

/**
 * A row of tabs that scrolls sideways when it doesn't fit (066), with its scrollbar hidden:
 *
 * - the current tab (`aria-current="page"` or `aria-selected="true"`) is scrolled into view on
 *   load and whenever it changes, without moving the page; smoothly, unless reduced motion is
 *   asked for;
 * - the edge with more tabs fades out, only while there's more to scroll to;
 * - tabs use `stripTab` for their 44px on a coarse pointer.
 *
 * It's the `<nav>` (or, with `role="tablist"`, the tab list) itself, so its children are the tabs.
 * Positioned, so it also clips screen-reader text inside it (065's lesson).
 */
export const ScrollStrip = ({
  label,
  role,
  className,
  children,
}: {
  /** The nav's (or tab list's) accessible name. */
  label?: string;
  /** `tablist` for buttons with `role="tab"`; a `<nav>` otherwise. */
  role?: "tablist";
  className?: string;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLElement & HTMLDivElement>(null);
  const [fade, setFade] = useState<ReturnType<typeof fadeClass>>(null);

  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const measure = () => setFade(fadeClass(strip));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const show = (smooth: boolean) => {
      const tab = strip.querySelector(CURRENT);
      if (!tab) return;
      const box = strip.getBoundingClientRect();
      const left = scrollToShow(
        { left: box.left, right: box.right, scrollLeft: strip.scrollLeft },
        tab.getBoundingClientRect(),
      );
      if (left === null) return;
      strip.scrollTo({ left, behavior: smooth && !reduced.matches ? "smooth" : "instant" });
    };
    show(false);
    measure();
    // The current tab changes without a new strip: the layout stays mounted (Admin, Docs), or a
    // tab is picked (Tabs).
    const changes = new MutationObserver(() => show(true));
    changes.observe(strip, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current", "aria-selected"],
    });
    const resize = new ResizeObserver(measure);
    resize.observe(strip);
    strip.addEventListener("scroll", measure, { passive: true });
    return () => {
      changes.disconnect();
      resize.disconnect();
      strip.removeEventListener("scroll", measure);
    };
  }, []);

  const classes = cn(
    "relative flex min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    fade,
    className,
  );
  return role === "tablist" ? (
    <div ref={ref} role="tablist" aria-label={label} className={classes}>
      {children}
    </div>
  ) : (
    <nav ref={ref} aria-label={label} className={classes}>
      {children}
    </nav>
  );
};
