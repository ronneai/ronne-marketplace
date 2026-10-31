"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** How often a visible page asks for the count again (139). */
export const POLL_MS = 60_000;

/**
 * The bell's count (139): what the server rendered, asked for again on every change of page and
 * every minute while the page is visible (and at once when it becomes visible again), through
 * `GET /notifications/count`. No push: a request a minute is cheap, and works with several
 * replicas. A failed request keeps the number it had.
 */
export const useUnreadCount = (initial: number) => {
  const [count, setCount] = useState(initial);
  const path = usePathname();
  const first = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/notifications/count", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const body: unknown = await response.json();
      const next = (body as { count?: unknown }).count;
      if (typeof next === "number" && Number.isFinite(next)) setCount(next);
    } catch {
      // Offline or the server is restarting: keep the number, try again on the next tick.
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: asks again on every change of page.
  useEffect(() => {
    // The first render has what the server just counted.
    if (first.current) {
      first.current = false;
      return;
    }
    if (document.visibilityState === "visible") void refresh();
  }, [path, refresh]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  return { count, setCount, refresh };
};
