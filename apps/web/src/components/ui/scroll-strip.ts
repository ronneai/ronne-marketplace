/** A strip's box and scroll, as the browser measures them. */
export type StripBox = { left: number; right: number; scrollLeft: number };

/** How far a fade reaches into the strip (`fade-*` in globals.css): a tab stays clear of it. */
export const FADE = 32;

/**
 * Which edges fade (066): the ones with more to scroll to. A pixel of slack, because browsers
 * round `scrollLeft` on zoomed and high-density screens.
 */
export const fadeClass = ({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): "fade-start" | "fade-end" | "fade-both" | null => {
  const start = scrollLeft > 1;
  const end = scrollLeft + clientWidth < scrollWidth - 1;
  if (start && end) return "fade-both";
  if (start) return "fade-start";
  if (end) return "fade-end";
  return null;
};

/**
 * The `scrollLeft` that brings the current tab fully into view, clear of the fades, moving the
 * strip as little as it can; `null` when it's already in view. Only sideways: the page itself
 * never moves, unlike `scrollIntoView`, which also scrolls the page to a strip below the fold.
 */
export const scrollToShow = (
  strip: StripBox,
  tab: { left: number; right: number },
): number | null => {
  const start = strip.left + FADE;
  const end = strip.right - FADE;
  let left: number | null = null;
  // Wider than the room between the fades: line its start up with the first fade.
  if (tab.left < start || tab.right - tab.left > end - start)
    left = Math.max(0, strip.scrollLeft + tab.left - start);
  else if (tab.right > end) left = strip.scrollLeft + tab.right - end;
  return left === strip.scrollLeft ? null : left;
};
