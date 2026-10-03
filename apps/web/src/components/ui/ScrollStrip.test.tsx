import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScrollStrip, stripTab } from "./ScrollStrip";
import { fadeClass, scrollToShow } from "./scroll-strip";
import { Tabs } from "./Tabs";

describe("fadeClass", () => {
  // A strip 300px wide showing 300 of its 600px.
  const at = (scrollLeft: number, scrollWidth = 600) =>
    fadeClass({ scrollLeft, scrollWidth, clientWidth: 300 });

  it("fades the edge that has more tabs, and both in the middle", () => {
    expect(at(0)).toBe("fade-end");
    expect(at(150)).toBe("fade-both");
    expect(at(300)).toBe("fade-start");
  });

  it("doesn't fade a strip that fits, or for a rounding pixel", () => {
    expect(at(0, 300)).toBeNull();
    expect(at(0.5, 300.5)).toBeNull();
    expect(at(299.5)).toBe("fade-start");
  });
});

describe("scrollToShow", () => {
  // The strip spans 0–300 on screen; tabs are measured on screen too.
  const strip = { left: 0, right: 300, scrollLeft: 100 };

  it("leaves a tab that's already clear of the fades", () => {
    expect(scrollToShow(strip, { left: 40, right: 120 })).toBeNull();
  });

  it("scrolls back to a tab hidden at the start, clear of the fade", () => {
    expect(scrollToShow(strip, { left: -60, right: 20 })).toBe(100 - 60 - 32);
  });

  it("scrolls on to a tab hidden at the end, clear of the fade", () => {
    expect(scrollToShow(strip, { left: 380, right: 460 })).toBe(100 + 460 - 268);
  });

  it("lines a tab wider than the room up with the start, and never scrolls below 0", () => {
    expect(scrollToShow(strip, { left: 100, right: 400 })).toBe(100 + 100 - 32);
    expect(scrollToShow({ ...strip, scrollLeft: 0 }, { left: 4, right: 80 })).toBeNull();
  });
});

describe("ScrollStrip", () => {
  it("is a positioned nav that scrolls sideways with no scrollbar, and no fade before it measures", () => {
    const html = renderToStaticMarkup(
      <ScrollStrip label="Item" className="gap-1">
        <a href="/a">A</a>
      </ScrollStrip>,
    );
    expect(html).toMatch(/^<nav aria-label="Item" class="relative flex min-w-0 overflow-x-auto /);
    expect(html).toContain("[scrollbar-width:none]");
    expect(html).toContain(" gap-1");
    expect(html).not.toContain("fade-");
  });

  it("is a tab list with role tablist", () => {
    const html = renderToStaticMarkup(
      <ScrollStrip role="tablist">
        <button type="button" role="tab" aria-selected>
          A
        </button>
      </ScrollStrip>,
    );
    expect(html).toMatch(/^<div role="tablist" class="relative flex/);
  });

  it("gives tabs 44px on a coarse pointer, centred, on one line", () => {
    expect(stripTab).toContain("pointer-coarse:min-h-11");
    expect(stripTab).toContain("items-center");
    expect(stripTab).toContain("whitespace-nowrap");
  });
});

describe("Tabs with many choices", () => {
  const tabs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ label: `Tab ${i}`, content: <p>{i}</p> }));

  it("keeps two or three choices in equal columns", () => {
    const html = renderToStaticMarkup(<Tabs tabs={tabs(3)} />);
    expect(html).toContain('role="tablist" class="grid auto-cols-fr');
    expect(html).not.toContain("overflow-x-auto");
  });

  it("scrolls four or more, each tab at its own width", () => {
    const html = renderToStaticMarkup(<Tabs tabs={tabs(4)} />);
    expect(html).toMatch(/role="tablist" class="relative flex min-w-0 overflow-x-auto/);
    expect(html).not.toContain("auto-cols-fr");
    expect(html.match(/pointer-coarse:min-h-11/g)).toHaveLength(4);
  });
});
