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
