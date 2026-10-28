"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How often the page looks again while its scan waits or runs. */
export const REFRESH_EVERY_MS = 5_000;

/** Calls `refresh` every `everyMs` until the returned function stops it. */
export const startRefreshing = (refresh: () => void, everyMs = REFRESH_EVERY_MS): (() => void) => {
  const timer = setInterval(refresh, everyMs);
  return () => clearInterval(timer);
};

/** Refreshes the review page while its scan is queued or running (135), then stops. */
export const ScanRefresh = () => {
  const router = useRouter();
  useEffect(() => startRefreshing(() => router.refresh()), [router]);
  return null;
};
