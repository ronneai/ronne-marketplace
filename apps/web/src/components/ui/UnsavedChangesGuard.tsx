"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/**
 * Where a click on a link would go, or null when the guard should let the browser handle it: a new
 * tab or window (a modifier key, a middle click, `target`), a download, or a link to this page.
 */
type Click = Pick<
  MouseEvent,
  "defaultPrevented" | "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
> & { target: EventTarget | null };

export const leavingHref = (
  event: Click,
  location: Pick<Location, "href" | "origin" | "pathname" | "search">,
): string | null => {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link) return null;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return null;
  const url = new URL(link.href, location.href);
  if (
    url.origin === location.origin &&
    url.pathname === location.pathname &&
    url.search === location.search
  )
    return null;
  return url.href;
};

/**
 * Asks before leaving a page with unsaved work (design system 032): while `dirty`, a link click
 * opens this dialog instead of navigating, and "Leave without saving" continues to the link.
 * Closing or reloading the tab gets the browser's own prompt: browsers don't allow a custom one.
 * Any form or editor can use it by passing whether it has unsaved changes.
 */
export const UnsavedChangesGuard = ({
  dirty,
  title = "Leave without saving?",
  message = "Your changes aren't saved. If you leave now, they're lost.",
}: {
  dirty: boolean;
  title?: string;
  message?: string;
}) => {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
    };
    // Capture phase, so it runs before Next.js's <Link> handles the click.
    const click = (event: MouseEvent) => {
      if (leaving.current) return;
      const href = leavingHref(event, window.location);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);

  const leave = () => {
    if (!pending) return;
    leaving.current = true;
    const url = new URL(pending);
    setPending(null);
    if (url.origin === window.location.origin)
      router.push(`${url.pathname}${url.search}${url.hash}`);
    else window.location.assign(url.href);
  };

  return (
    <Dialog open={pending !== null} onClose={() => setPending(null)} title={title}>
      <div className="grid gap-4">
        <p className="text-sm text-fg">{message}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setPending(null)}>
            Stay on this page
          </Button>
          <Button variant="destructive" onClick={leave}>
            Leave without saving
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
