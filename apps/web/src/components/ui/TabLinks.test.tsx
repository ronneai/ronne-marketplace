import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabLinks } from "./TabLinks";

const TABS = [
  { id: "usage", label: "Usage", href: "/admin/settings" },
  { id: "feeds", label: "Plugin feeds", href: "/admin/settings?tab=feeds" },
  { id: "authentication", label: "Authentication", href: "/admin/settings?tab=authentication" },
];

describe("TabLinks", () => {
  it("renders a labelled nav of links, one per tab, each with its own address", () => {
    const html = renderToStaticMarkup(<TabLinks label="Settings" tabs={TABS} current="usage" />);
    expect(html).toContain('aria-label="Settings"');
    expect(html).toContain('href="/admin/settings"');
    expect(html).toContain('href="/admin/settings?tab=feeds"');
    expect(html).toContain('href="/admin/settings?tab=authentication"');
  });

  it("marks only the current tab", () => {
    const html = renderToStaticMarkup(<TabLinks label="Settings" tabs={TABS} current="feeds" />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Plugin feeds</);
  });

  it("marks none when the current id is unknown", () => {
    const html = renderToStaticMarkup(<TabLinks label="Settings" tabs={TABS} current="nope" />);
    expect(html).not.toContain("aria-current");
  });

  it("uses the 44px coarse-pointer tab class from the scroll strip", () => {
    const html = renderToStaticMarkup(<TabLinks label="Settings" tabs={TABS} current="usage" />);
    expect(html).toContain("pointer-coarse:min-h-11");
  });
});
