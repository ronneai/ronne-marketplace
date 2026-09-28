"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Warns before leaving with unsaved changes: the browser's own prompt when closing or reloading,
 * and a confirm for links inside the app, which the browser doesn't catch.
 */
export const useUnsavedWarning = (dirty: boolean) => {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!link || link.getAttribute("target") === "_blank" || event.defaultPrevented) return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
};

/** Ctrl+S or Cmd+S runs `save` instead of the browser's "Save page". */
export const useSaveShortcut = (save: () => void) => {
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        latest.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
};

/** `value`, once it has stopped changing for `delay` ms: validation doesn't run on every key. */
export const useDebounced = <T>(value: T, delay: number): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
};
