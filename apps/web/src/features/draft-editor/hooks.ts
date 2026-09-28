"use client";

import { useEffect, useRef, useState } from "react";

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
