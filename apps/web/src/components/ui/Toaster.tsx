"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, useEffect } from "react";
import { Toaster as Region } from "sonner";

/** At most this many at once (138); a fourth pushes out the oldest. */
export const MAX_TOASTS = 3;

/**
 * 16px above the bottom edge, the home indicator and, on a phone, a `BottomBar`, which publishes
 * its height as `--bottom-bar-height` (067). Unset, it is 0.
 */
const ABOVE_BAR = "calc(var(--bottom-bar-height, 0px) + env(safe-area-inset-bottom, 0px) + 16px)";

/**
 * The toast region, mounted once in the root layout (138). Sonner's section is always in the page,
 * empty when idle, as a polite live region; each toast draws itself (`ToastCard`), so the colours
 * and the shape are the design system's. Bottom right, 16px from the edges.
 */
export const Toaster = () => {
  const t = useTranslations("common.toast");
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
      position="bottom-right"
      offset={{ bottom: ABOVE_BAR, right: 16 }}
      mobileOffset={{ bottom: ABOVE_BAR, left: 16, right: 16 }}
      visibleToasts={MAX_TOASTS}
      customAriaLabel={t("region")}
      // At most 24rem wide (138); Sonner stretches to the screen on a phone.
      style={{ "--width": "24rem" } as CSSProperties}
      toastOptions={{ unstyled: true }}
    />
  );
};
