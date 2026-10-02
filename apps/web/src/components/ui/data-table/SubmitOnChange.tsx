"use client";

import { useEffect, useRef } from "react";

/**
 * Makes its form submit when a select or date changes, and when a text field rests for a moment
 * (060), and hides the form's `[data-submit]` button, which only matters without JavaScript.
 * Renders nothing visible: drop it inside a GET form.
 */
export const SubmitOnChange = ({ delay = 400 }: { delay?: number }) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    for (const button of form.querySelectorAll<HTMLElement>("[data-submit]")) button.hidden = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const submit = () => form.requestSubmit();
    // Text searches submit after a pause while typing (below), not again when they lose focus.
    const onChange = (event: Event) => {
      const { target } = event;
      if (target instanceof HTMLSelectElement) submit();
      else if (target instanceof HTMLInputElement && target.type !== "search") submit();
    };
    const onInput = (event: Event) => {
      if (!(event.target instanceof HTMLInputElement) || event.target.type !== "search") return;
      clearTimeout(timer);
      timer = setTimeout(submit, delay);
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onInput);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("change", onChange);
      form.removeEventListener("input", onInput);
    };
  }, [delay]);
  return <span ref={ref} hidden />;
};
