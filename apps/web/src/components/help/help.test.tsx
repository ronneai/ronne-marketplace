import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inLocale } from "@/test/intl";
import { HELP, Help, type HelpId } from "./Help";
import { DOCS_URL, docsHref, localizedDocsHref, topicOf } from "./topics";

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
      const link = html.match(
        new RegExp(`<a href="${localizedDocsHref(HELP[id].href, "en")}"[^>]*>`),
      )?.[0];
      expect(link, id).toContain('target="_blank" rel="noopener noreferrer"');
      expect(html).toContain("Learn more<svg");
      expect(html).toContain("(opens in a new tab)");
    }
  });
});

describe("Documentation links in the person's language (129)", () => {
  const locales = ["en", "pt", "fr"] as const;
  /** The same check as `target`, for an address with a language in it. */
  const localizedTarget = (href: string, locale: string) => {
    const prefix = `https://www.ronne.ai/${locale}/marketplace/docs`;
    return href.startsWith(prefix) ? target(`${DOCS_URL}${href.slice(prefix.length)}`) : null;
  };

  it("puts the language after the site's address, and keeps the topic and section", () => {
    expect(localizedDocsHref(DOCS_URL, "pt")).toBe("https://www.ronne.ai/pt/marketplace/docs");
    expect(localizedDocsHref(docsHref("rmk"), "fr")).toBe(
      "https://www.ronne.ai/fr/marketplace/docs/rmk",
    );
    expect(localizedDocsHref(docsHref("scopes", "names"), "pt")).toBe(
      "https://www.ronne.ai/pt/marketplace/docs/scopes#names",
    );
    expect(localizedDocsHref(`${DOCS_URL}?x=1`, "en")).toBe(
      "https://www.ronne.ai/en/marketplace/docs?x=1",
    );
  });

  it("leaves alone anything that isn't the Documentation, or only starts like it", () => {
    for (const href of [
      "https://www.ronne.ai/marketplace/docsx",
      "https://www.ronne.ai/marketplace/docs-evil",
      "https://www.ronne.ai/marketplace",
      "http://www.ronne.ai/marketplace/docs",
      "https://evil.test/https://www.ronne.ai/marketplace/docs",
      "https://www.ronne.ai.evil.test/marketplace/docs",
      "/account/tokens",
      "",
    ])
      expect(localizedDocsHref(href, "pt"), href).toBe(href);
  });

  it("every helper links, in each language, to a topic section that exists", () => {
    for (const locale of locales)
      for (const [id, help] of Object.entries(HELP))
        expect(
          localizedTarget(localizedDocsHref(help.href, locale), locale),
          `${locale} ${id}`,
        ).not.toBeNull();
  });

  it("a helper's Learn more opens the language's pages", () => {
    for (const locale of ["pt", "fr"] as const) {
      const html = inLocale(locale, () => renderToStaticMarkup(<Help id="scope" />));
      expect(html).toContain(`<a href="${localizedDocsHref(HELP["scope"].href, locale)}"`);
      expect(html).not.toContain(`<a href="${HELP["scope"].href}"`);
    }
  });
});
