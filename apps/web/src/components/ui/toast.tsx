"use client";

import { toast as sonner, type ToastT, type ToastToDismiss } from "sonner";
import { ToastCard, type ToastKind } from "./ToastCard";
import { MAX_TOASTS } from "./Toaster";

/** How long each kind stays, in ms: a warning or an error until it is closed (138). */
export const TOAST_DURATION: Record<ToastKind, number> = {
  ok: 5000,
  info: 5000,
  warning: Number.POSITIVE_INFINITY,
  error: Number.POSITIVE_INFINITY,
};

/** The same kind and message, open at once, are one toast (138); this is its id. */
export const toastId = (kind: ToastKind, message: string) => `${kind}:${message}`;

const isOpen = (t: ToastT | ToastToDismiss): t is ToastT => !("dismiss" in t) && !t.delete;

const show = (kind: ToastKind, message: string) => {
  const id = toastId(kind, message);
  // A fourth pushes out the oldest that isn't an error (a pile of errors stays, each unread).
  const open = sonner.getToasts().filter(isOpen);
  if (open.length >= MAX_TOASTS && !open.some((t) => t.id === id)) {
    const oldest = open.find((t) => !String(t.id).startsWith("error:"));
    if (oldest) sonner.dismiss(oldest.id);
  }
  // One at a time per message: a repeat starts the timer again, from the first.
  sonner.dismiss(id);
  sonner.custom(
    (key) => <ToastCard kind={kind} message={message} onClose={() => sonner.dismiss(key)} />,
    {
      id,
      duration: TOAST_DURATION[kind],
    },
  );
};

/** The functions a client component calls once an action has returned (138). */
export const toast = {
  ok: (message: string) => show("ok", message),
  info: (message: string) => show("info", message),
  warning: (message: string) => show("warning", message),
  error: (message: string) => show("error", message),
};

/**
 * `const toast = useToast(); toast.ok(t("saved"))`. The functions don't depend on the component,
 * so it is the same object on every render. Only this wrapper imports Sonner.
 */
export const useToast = () => toast;

/** Closes every toast at once: a page that signs the person out has no use for what was said. */
export const dismissToasts = () => {
  sonner.dismiss();
};
