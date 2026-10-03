"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "./cn";

/**
 * A button that opens a panel below it: the catalogue's Filters and Sort. A native <details>, so
 * it works without JavaScript; with it, the panel also closes on a click outside, on Esc (focus
 * goes back to the button) and when a link inside it is followed. `align` puts the panel under
 * the button's left or right edge; on a phone it takes the content's width.
 */
export const Disclosure = ({
  summary,
  children,
  align = "left",
  className,
  summaryClassName,
  panelClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
  summaryClassName?: string;
  panelClassName?: string;
}) => {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const close = () => {
      details.open = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (details.open && !details.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.open) return;
      close();
      details.querySelector("summary")?.focus();
    };
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]")) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    details.addEventListener("keydown", onKeyDown);
    details.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      details.removeEventListener("keydown", onKeyDown);
      details.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <details ref={ref} className={cn("group relative", className)}>
      <summary
        className={cn(
          "inline-flex h-9 pointer-coarse:h-11 cursor-pointer list-none items-center gap-2 rounded-control border border-strong bg-surface px-3 text-sm font-semibold text-fg hover:border-accent [&::-webkit-details-marker]:hidden",
          "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus group-open:border-accent",
          summaryClassName,
        )}
      >
        {summary}
      </summary>
      <div
        className={cn(
          "absolute z-20 mt-2 w-[min(32rem,calc(100vw-2rem))] rounded-panel border border-strong bg-surface p-4",
          align === "right" ? "right-0" : "left-0",
          panelClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
};
