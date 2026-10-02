"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "./cn";

/**
 * A modal dialog on the native <dialog> element: the browser traps focus, makes the page behind it
 * inert, and closes it on Esc. Flat 8px panel (design system 032).
 *
 * `large` (054) is a fixed frame, 640px wide and up to 720px tall: its content lays itself out in a
 * column, so a long list can scroll inside while what's above and below it stays in view.
 */
export const Dialog = ({
  open,
  onClose,
  title,
  children,
  size = "default",
}: {
  size?: "default" | "large";
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  // Unique per dialog: a page can hold several (the editor has its leave guard and its own).
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className={cn(
        "m-auto rounded-panel border border-strong bg-surface p-0 text-left text-fg backdrop:bg-canvas/80",
        size === "large"
          ? "h-[min(45rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))] flex-col open:flex"
          : "w-[min(32rem,calc(100vw-2rem))]",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {size === "large" ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : (
        <div className="p-4">{children}</div>
      )}
    </dialog>
  );
};
