"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * A modal dialog on the native <dialog> element: the browser traps focus, makes the page behind it
 * inert, and closes it on Esc. Flat 8px panel (design system 032).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
      aria-labelledby="dialog-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-panel border border-strong bg-surface p-0 text-fg backdrop:bg-canvas/80"
    >
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 id="dialog-title" className="text-lg font-semibold">
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
      <div className="p-4">{children}</div>
    </dialog>
  );
}
