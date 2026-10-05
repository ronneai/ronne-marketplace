import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP, Help, type HelpId } from "./Help";
import { DOCS_URL, docsHref, topicOf } from "./topics";

/** Where a website Documentation link lands, or null when there's no such topic or section. */
const target = (href: string) => {
  if (!href.startsWith(DOCS_URL)) return null;
  const match = /^(?:\/([a-z-]+))?(?:#([a-z-]+))?$/.exec(href.slice(DOCS_URL.length));
  if (!match) return null;
  const topic = topicOf(match[1] ?? "overview");
  if (!topic) return null;
  return !match[2] || topic.sections.some((s) => s.id === match[2]) ? topic : null;
};

describe("inline help", () => {
  it("links every helper to a topic section that exists", () => {
    for (const [id, help] of Object.entries(HELP)) expect(target(help.href), id).not.toBeNull();
    expect(target(`${DOCS_URL}/scopes#nope`)).toBeNull();
    expect(target(`${DOCS_URL}/nope`)).toBeNull();
    expect(target("/docs/scopes#what")).toBeNull();
  });

  it("links to the website's Documentation (088)", () => {
    expect(DOCS_URL).toBe("https://www.ronne.ai/marketplace/docs");
    expect(docsHref("overview")).toBe(DOCS_URL);
    expect(docsHref("overview", "path")).toBe(`${DOCS_URL}#path`);
    expect(docsHref("scopes", "names")).toBe(`${DOCS_URL}/scopes#names`);
    expect(docsHref("rmk")).toBe(`${DOCS_URL}/rmk`);
  });

  it("renders a helper as its question, answer and Learn more", () => {
    for (const id of Object.keys(HELP) as HelpId[]) {
      const html = renderToStaticMarkup(<Help id={id} />);
      expect(html).toContain(HELP[id].question.replaceAll("'", "&#x27;"));
      const link = html.match(new RegExp(`<a href="${HELP[id].href}"[^>]*>`))?.[0];
      expect(link, id).toContain('target="_blank" rel="noopener noreferrer"');
      expect(html).toContain("Learn more<svg");
      expect(html).toContain("(opens in a new tab)");
    }
  });
});
