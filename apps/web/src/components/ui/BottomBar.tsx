"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "./cn";

/** Where the bar stops showing: from this breakpoint up, the page shows its actions itself. */
type Until = "sm" | "md" | "lg";
const HIDDEN_FROM: Record<Until, string> = { sm: "sm:hidden", md: "md:hidden", lg: "lg:hidden" };

/**
 * A bar of actions stuck to the bottom of the screen on phones (067): the editor's Save and Submit
 * (072), the review page's decisions (073). Put it last in the page's content: it sticks to the
 * bottom while the page scrolls, padded for the home indicator, and spans the content's padding.
 *
 * The bar publishes the distance from its top edge to the bottom of the screen as
 * `--bottom-bar-height` on the page (138), so the toasts sit above it and whatever is under it; 0
 * while it is hidden.
 *
 * On iOS the on-screen keyboard covers the bottom of the page without resizing it, so the bar
 * follows the visual viewport to stay above the keyboard. With `hideWhileTyping`, it steps aside
 * while a field elsewhere on the page has focus, to leave that field the room.
 */
export const BottomBar = ({
  children,
  until = "lg",
  hideWhileTyping = false,
  label,
  className,
}: {
  children: ReactNode;
  until?: Until;
  hideWhileTyping?: boolean;
  /** Names the bar for screen readers ("Draft actions"). */
  label: string;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const follow = () =>
      setLift(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    viewport.addEventListener("resize", follow);
    viewport.addEventListener("scroll", follow);
    return () => {
      viewport.removeEventListener("resize", follow);
      viewport.removeEventListener("scroll", follow);
    };
  }, []);

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    let frame = 0;
    const publish = () => {
      frame = 0;
      // From the bar's top edge to the bottom of what is seen, so anything under the bar (the
      // app's own bottom navigation, the footer it rests on, the keyboard) is counted too. 0 when
      // the bar is not shown (`hidden`, or `display: none` from `until` up).
      const { top, height } = bar.getBoundingClientRect();
      const seen = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty(
        "--bottom-bar-height",
        height ? `${Math.max(0, seen - top)}px` : "0px",
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(publish);
    };
    publish();
    const observer = new ResizeObserver(schedule);
    observer.observe(bar);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      root.style.removeProperty("--bottom-bar-height");
    };
  }, []);

  useEffect(() => {
    if (!hideWhileTyping) return;
    const isField = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      target.matches("input, select, textarea, [contenteditable], [contenteditable] *") &&
      !ref.current?.contains(target);
    const onFocusIn = (event: FocusEvent) => setTyping(isField(event.target));
    const onFocusOut = () => setTyping(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [hideWhileTyping]);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      hidden={typing}
      style={lift ? { bottom: lift } : undefined}
      className={cn(
        "sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-hairline bg-surface px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6",
        HIDDEN_FROM[until],
        className,
      )}
    >
      {children}
    </div>
  );
};
