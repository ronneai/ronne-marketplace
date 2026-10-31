"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useRef } from "react";
import { Toaster as Region } from "sonner";

/** At most this many at once (138); a fourth pushes out the oldest. */
export const MAX_TOASTS = 3;

/**
 * 16px above the bottom edge, the home indicator and, on a phone, a `BottomBar`, which publishes
 * its height as `--bottom-bar-height` (067). Unset, it is 0.
 */
const ABOVE_BAR = "calc(var(--bottom-bar-height, 0px) + env(safe-area-inset-bottom, 0px) + 16px)";
/** On a phone, an open dialog is the whole screen: the toast also clears its buttons. */
const ABOVE_BAR_AND_DIALOG =
  "calc(var(--bottom-bar-height, 0px) + var(--toast-dialog-actions, 0px) + env(safe-area-inset-bottom, 0px) + 16px)";
/** Below Tailwind's `sm`, where dialogs fill the screen (067). */
const PHONE = "(max-width: 639px)";

/**
 * The toast region, mounted once in the root layout (138). Sonner's section is always in the page,
 * empty when idle, as a polite live region; each toast draws itself (`ToastCard`), so the colours
 * and the shape are the design system's. Bottom right, 16px from the edges.
 */
export const Toaster = () => {
  const t = useTranslations("common.toast");
  const region = useRef<HTMLElement>(null);
  // A modal dialog is in the browser's top layer, above everything, with the page behind it inert.
  // No popover or z-index lifts the region over that, and an inert region couldn't be used. So
  // while a dialog is open the region lives inside it (the same node, moved), seen over its
  // backdrop and working; it goes back to the page when the dialog closes.
  useEffect(() => {
    const section = region.current;
    const home = section?.parentElement;
    if (!(section && home)) return;
    section.setAttribute("data-toast-region", "");
    const phone = window.matchMedia(PHONE);
    const place = () => {
      const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
      const open = dialogs.item(dialogs.length - 1) as HTMLDialogElement | null;
      const target = open ?? home;
      if (section.parentElement !== target) target.append(section);
      // On a phone the dialog is the whole screen: the toast rides above its buttons.
      const actions = phone.matches
        ? open?.querySelector<HTMLElement>("[data-dialog-actions]")
        : null;
      const from = actions ? Math.max(0, innerHeight - actions.getBoundingClientRect().top) : 0;
      section.style.setProperty("--toast-dialog-actions", `${from}px`);
    };
    place();
    const observer = new MutationObserver(place);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);
  // Sonner stops its timers for the pointer and a hidden tab, not for the keyboard. Focus inside
  // the list counts as the pointer being over it: it is told so the way the pointer would.
  useEffect(() => {
    const list = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>("[data-sonner-toaster]") : null;
    const tell = (type: "mouseover" | "mouseout", target: HTMLElement) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    const onIn = (event: FocusEvent) => {
      const target = list(event.target);
      if (target) tell("mouseover", target);
    };
    const onOut = (event: FocusEvent) => {
      const target = list(event.target);
      if (target && list(event.relatedTarget) !== target) tell("mouseout", target);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return (
    <Region
      ref={region}
      position="bottom-right"
      offset={{ bottom: ABOVE_BAR, right: 16 }}
      mobileOffset={{ bottom: ABOVE_BAR_AND_DIALOG, left: 16, right: 16 }}
      visibleToasts={MAX_TOASTS}
      customAriaLabel={t("region")}
      // At most 24rem wide (138); Sonner stretches to the screen on a phone.
      style={{ "--width": "24rem" } as CSSProperties}
      toastOptions={{ unstyled: true }}
    />
  );
};
