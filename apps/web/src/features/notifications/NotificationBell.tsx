"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Popover } from "@/components/ui/Popover";
import { NotificationPanel } from "./NotificationPanel";
import { useUnreadCount } from "./use-unread-count";

/** The most the badge shows; more reads "99+", as the sidebar's counts do (158). */
const MAX_SHOWN = 99;

/** Tailwind's `sm`: below it the panel is a screen of its own, as every dialog is (067). */
const PHONE_QUERY = "(max-width: 39.999rem)";

const buttonClass =
  "relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-control border border-hairline text-fg hover:border-strong pointer-coarse:size-11 outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

const useIsPhone = () => {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return phone;
};

/**
 * The notification bell (139), in the top bar: an icon with the unread count as a badge ("99+" past
 * ninety-nine), whose name says the count. Clicked, it opens the ten latest in a floating panel (a
 * full screen below `sm`). The count is what the server rendered, asked for again on each page and
 * every minute while the page is visible.
 */
export const NotificationBell = ({ initialCount }: { initialCount: number }) => {
  const t = useTranslations("notifications");
  const { count, setCount } = useUnreadCount(initialCount);
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const label = t("ui.bell", { count });
  const face = (
    <>
      <Bell size={18} aria-hidden />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-strong px-1 text-xs leading-none font-semibold tabular-nums text-on-accent"
        >
          {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
        </span>
      ) : null}
    </>
  );

  return phone ? (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={buttonClass}
      >
        {face}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("ui.title")} closeOnBackdrop>
        {open ? (
          <NotificationPanel
            unread={count}
            onUnread={setCount}
            onNavigate={() => setOpen(false)}
            heading={false}
          />
        ) : null}
      </Dialog>
    </>
  ) : (
    <Popover
      label={label}
      button={face}
      buttonClassName={buttonClass}
      placement="bottom-end"
      maxWidth={430}
      bare
      className="flex w-[430px] flex-col border-hairline bg-surface"
    >
      {(close) => <NotificationPanel unread={count} onUnread={setCount} onNavigate={close} />}
    </Popover>
  );
};
