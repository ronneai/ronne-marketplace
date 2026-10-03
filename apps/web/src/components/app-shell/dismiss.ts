/** What `dismissDetails` needs from a `<details>`: it's the element in the browser, a stub in tests. */
export type DetailsLike = {
  open: boolean;
  contains: (node: Node | null) => boolean;
  querySelector: (selector: "summary") => { focus: () => void } | null;
};

/**
 * Closes an open `<details>` menu on a pointer down outside it and on Esc (066). Esc puts focus
 * back on its `<summary>`, as a menu button would. Returns the cleanup. A plain function, not a
 * hook, so the tests can drive it with an `EventTarget` and no browser.
 */
export const dismissDetails = (details: DetailsLike, doc: EventTarget): (() => void) => {
  const onPointerDown = (event: Event) => {
    if (details.open && !details.contains(event.target as Node | null)) details.open = false;
  };
  const onKeyDown = (event: Event) => {
    if (!details.open || (event as KeyboardEvent).key !== "Escape") return;
    details.open = false;
    details.querySelector("summary")?.focus();
  };
  doc.addEventListener("pointerdown", onPointerDown);
  doc.addEventListener("keydown", onKeyDown);
  return () => {
    doc.removeEventListener("pointerdown", onPointerDown);
    doc.removeEventListener("keydown", onKeyDown);
  };
};
