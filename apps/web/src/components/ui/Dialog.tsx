"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "./cn";

/**
 * A modal dialog on the native <dialog> element: the browser traps focus, makes the page behind it
 * inert, and closes it on Esc. Flat 8px panel (design system 032).
 *
 * The title bar stays at the top and only the body scrolls; a `DialogActions` row at the end of
 * the body sticks to the bottom, so a long dialog keeps its title and buttons in view (067).
 * Below `sm` every dialog fills the screen (067), padded for the notch and the home indicator.
 *
 * - `large` (054) is a fixed frame, 640px wide and up to 720px tall: its content lays itself out in
 *   a column, so a long list can scroll inside while what's above and below it stays in view.
 * - `side` (066) is a sheet from the right, full height: 20rem wide, the whole width on a phone.
 */
export const Dialog = ({
  open,
  onClose,
  title,
  children,
  size = "default",
}: {
  size?: "default" | "large" | "side";
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

  // iOS doesn't always scroll a focused field above the on-screen keyboard inside a dialog: once
  // the keyboard is up, bring the field into view (067).
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const keepInView = (event: FocusEvent) => {
      const field = event.target;
      if (!(field instanceof HTMLElement)) return;
      if (!field.matches("input, select, textarea, [contenteditable]")) return;
      window.setTimeout(() => field.scrollIntoView({ block: "nearest" }), 300);
    };
    dialog.addEventListener("focusin", keepInView);
    return () => dialog.removeEventListener("focusin", keepInView);
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className={cn(
        "rounded-panel border border-strong bg-surface p-0 text-left text-fg backdrop:bg-canvas/80 open:flex flex-col",
        size === "side"
          ? "m-0 ml-auto h-dvh max-h-none w-[min(20rem,100vw)] max-w-none rounded-none border-y-0 border-r-0"
          : cn(
              "m-auto max-h-[calc(100dvh-2rem)]",
              size === "large"
                ? "h-[min(45rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))]"
                : "w-[min(32rem,calc(100vw-2rem))]",
            ),
        // A phone: the whole screen.
        "max-sm:m-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0",
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-2">
        <h2 id={titleId} className="min-w-0 text-lg font-semibold break-words">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-control text-muted hover:bg-tint hover:text-fg pointer-coarse:size-11 outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {size === "large" ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
          {children}
        </div>
      )}
    </dialog>
  );
};

/**
 * A dialog's buttons, last in its body: they stick to the bottom while the body scrolls, so they
 * stay in reach on a phone with the keyboard open (067). Works inside the dialog's `<form>`.
 */
export const DialogActions = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-surface px-4 py-3",
      "max-sm:-mb-[max(1rem,env(safe-area-inset-bottom))] max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      className,
    )}
  >
    {children}
  </div>
);
