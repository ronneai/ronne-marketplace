import type { Page } from "@playwright/test";

/**
 * What the phone sweep (feature 065) measures on a page, run in the browser. Kept apart from the
 * test so other `*.mobile.e2e.ts` files can check one page the same way.
 */

/** An element that sticks out of the viewport, described so a person can find it. */
export type Offender = { element: string; left: number; right: number };

export type Overflow = {
  /** The document's width, and the viewport's. Wider means the page scrolls sideways. */
  scrollWidth: number;
  viewportWidth: number;
  /** The outermost elements past either edge that no scrolling or clipping frame contains. */
  offenders: Offender[];
};

/** A control smaller than a finger: its description, size, and whether a pointer-only size. */
export type SmallTarget = { element: string; width: number; height: number };

export const measureOverflow = (page: Page): Promise<Overflow> =>
  page.evaluate(() => {
    const describe = (el: Element) => {
      const classes = [...el.classList].slice(0, 4).join(".");
      const label =
        el.getAttribute("aria-label") ??
        el.getAttribute("name") ??
        (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${classes ? `.${classes}` : ""}${label ? ` "${label}"` : ""}`;
    };
    const viewportWidth = document.documentElement.clientWidth;
    // Inside a frame that scrolls or clips sideways, sticking out of the viewport is the frame's
    // business (a code line in a `pre`, a tab strip), not the page's. An absolutely positioned box
    // is only clipped by a frame that is itself positioned (CSS containing blocks): a screen-reader
    // label in a scrolling nav still widens the page if nothing between them is positioned.
    const framed = (el: Element) => {
      const own = getComputedStyle(el).position;
      if (own === "fixed") return false;
      let needsPositioned = own === "absolute";
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const style = getComputedStyle(p);
        const positioned = style.position !== "static";
        if ((!needsPositioned || positioned) && style.overflowX !== "visible") return true;
        if (style.position === "fixed") return false;
        if (!needsPositioned || positioned) needsPositioned = style.position === "absolute";
      }
      return false;
    };
    const out = new Set<Element>();
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= viewportWidth + 1 && r.left >= -1) continue;
      if (framed(el)) continue;
      out.add(el);
    }
    const offenders = [...out]
      .filter((el) => !el.parentElement || !out.has(el.parentElement))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { element: describe(el), left: Math.round(r.left), right: Math.round(r.right) };
      })
      .sort((a, b) => b.right - a.right)
      .slice(0, 3);
    return { scrollWidth: document.documentElement.scrollWidth, viewportWidth, offenders };
  });

export const overflows = (o: Overflow) => o.scrollWidth > o.viewportWidth || o.offenders.length > 0;

/** "page is 412px wide in a 320px viewport; sticks out: select "scope" (−4 to 412px)". */
export const describeOverflow = (o: Overflow) =>
  `page is ${o.scrollWidth}px wide in a ${o.viewportWidth}px viewport; sticks out: ${
    o.offenders.map((x) => `${x.element} (${x.left} to ${x.right}px)`).join(", ") ||
    "nothing visible"
  }`;

/** Visible controls under 44px either way, measured by their box (065's tap-target report). */
export const smallTargets = (page: Page): Promise<SmallTarget[]> =>
  page.evaluate(() => {
    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="link"]';
    const result: { element: string; width: number; height: number }[] = [];
    for (const el of document.querySelectorAll(selector)) {
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      // Screen-reader-only text is 1px on purpose.
      if (r.width <= 1 || r.height <= 1) continue;
      if (r.width >= 44 && r.height >= 44) continue;
      const classes = [...el.classList].slice(0, 3).join(".");
      const label =
        el.getAttribute("aria-label") ??
        (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
      result.push({
        element: `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${label ? ` "${label}"` : ""}`,
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
    }
    return result;
  });
