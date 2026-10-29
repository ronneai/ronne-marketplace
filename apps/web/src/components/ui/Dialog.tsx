"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "./cn";

/** The dialog sizes (123): one scale for the whole app, widths in rem, and the phone's screen below `sm`. */
export const DIALOG_SIZES = {
  /** 24rem (384px): a short confirmation, one question. */
  small: "w-[min(24rem,calc(100vw-2rem))]",
  /** 32rem (512px): an ordinary form. The default. */
  medium: "w-[min(32rem,calc(100vw-2rem))]",
  /** 40rem (640px): lists of long names, rows with two fields. */
  large: "w-[min(40rem,calc(100vw-2rem))]",
  /** 56rem (896px): content in two columns, such as Erase user. */
  xlarge: "w-[min(56rem,calc(100vw-2rem))]",
} as const;
export type DialogSize = keyof typeof DIALOG_SIZES;

/**
 * A modal dialog on the native <dialog> element: the browser traps focus, makes the page behind it
 * inert, and closes it on Esc. Flat 8px panel (design system 032).
 *
 * The title bar stays at the top and only the body scrolls; a `DialogActions` row at the end of
 * the body sticks to the bottom, so a long dialog keeps its title and buttons in view (067).
 * Below `sm` every dialog fills the screen (067), padded for the notch and the home indicator.
 *
 * - `size` is one of `small`, `medium` (the default), `large` and `xlarge` (`DIALOG_SIZES`): 24, 32,
 *   40 and 56rem wide. Pick the smallest that fits the content without scrolling on a laptop
 *   screen; docs/knowledge/dialog-sizes.md says which to use for what.
 * - `fixedHeight` (054) makes a frame of up to 45rem tall instead of fitting its content: the
 *   content lays itself out in a column, so a long list can scroll inside while what's above and
 *   below it stays in view. It takes any width on the scale.
 * - `side` (066) is a sheet from the right, full height: 20rem wide, the whole width on a phone. It
 *   is a different kind of surface, not a size on the scale.
 *
 * Its text wraps whatever surrounds the trigger (115): a dialog sits in the DOM where it's opened,
 * such as a table cell that keeps its buttons on one line, and would otherwise inherit `nowrap`.
 * A word too long for its line, such as a 64-character name, breaks anywhere rather than widen it.
 *
 * `closeOnBackdrop` closes it on a click or tap outside the panel (066's menu). Off by default, so
 * a stray tap can't lose what's typed in a form.
 *
 * `busy` keeps it open while what it started is saving (137): Esc is refused (and, should the
 * browser close it anyway, it opens again), the close button is off, the backdrop does nothing.
 */
export const Dialog = ({
  open,
  onClose,
  title,
  children,
  size = "medium",
  fixedHeight = false,
  closeOnBackdrop = false,
  busy = false,
}: {
  busy?: boolean;
  size?: DialogSize | "side";
  fixedHeight?: boolean;
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  closeOnBackdrop?: boolean;
}) => {
  const t = useTranslations("common");
  const ref = useRef<HTMLDialogElement>(null);
  // Unique per dialog: a page can hold several (the editor has its leave guard and its own).
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    // Closed by the caller: once it's no longer busy, should that be what held it.
    if (!open && !busy && dialog.open) dialog.close();
  }, [open, busy]);

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
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard closes it with Esc, natively.
    <dialog
      ref={ref}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={() => {
        // Browsers may close on a second Esc whatever `cancel` said: put it back while busy.
        if (busy && open) ref.current?.showModal();
        else onClose();
      }}
      // A click on the backdrop targets the <dialog> itself; the panel's content covers the rest.
      onClick={
        closeOnBackdrop
          ? (event) => event.target === event.currentTarget && !busy && onClose()
          : undefined
      }
      aria-labelledby={titleId}
      className={cn(
        "rounded-panel border border-strong bg-surface p-0 text-left font-normal whitespace-normal [overflow-wrap:anywhere] text-fg backdrop:bg-canvas/80 open:flex flex-col",
        size === "side"
          ? "m-0 ml-auto h-dvh max-h-none w-[min(20rem,100vw)] max-w-none rounded-none border-y-0 border-r-0"
          : cn(
              "m-auto max-h-[calc(100dvh-2rem)]",
              DIALOG_SIZES[size],
              fixedHeight && "h-[min(45rem,calc(100dvh-2rem))]",
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
          // Nothing passed: a caller's `onClose` may take an argument of its own.
          onClick={() => onClose()}
          disabled={busy}
          aria-label={t("close")}
          className="-mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-control text-muted hover:bg-tint hover:text-fg pointer-coarse:size-11 outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {fixedHeight ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] has-[[data-dialog-actions]]:pb-0 sm:pb-4 sm:has-[[data-dialog-actions]]:pb-0">
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
    data-dialog-actions=""
    className={cn(
      // No negative bottom margin: a sticky box that sticks out of its container is pushed back
      // inside it, which used to lift the bar 16px into the content (123). The body drops its own
      // bottom padding when it holds this bar (`has-[[data-dialog-actions]]:pb-0`), so the bar sits
      // flush at the bottom; `mt-4` is the air above it, on top of the form's own gap.
      "sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-surface px-4 py-3",
      "max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      className,
    )}
  >
    {children}
  </div>
);
