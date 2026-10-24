import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { HELP, Help, type HelpId } from "./Help";
import { DOCS_URL, docsHref, localizedDocsHref, topicOf } from "./topics";

/** Where a website Documentation link lands, or null when there's no such topic or section. */
const english = (await import("../../../messages/en/help.json")).default as Record<
  string,
  { question: string; answer: string }
>;
type MovedId = string;

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
      const question =
        "question" in HELP[id] ? HELP[id].question : english[id as MovedId]?.question;
      expect(question, id).toBeTruthy();
      expect(html).toContain(String(question).replaceAll("'", "&#x27;"));
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

describe("the helpers moved to messages (130)", () => {
  const MOVED = [
    "workspace",
    "personal-workspace",
    "requests-who",
    "member-roles",
    "move-approve",
    "current-workspace",
    "contents",
    "install",
    "plugin",
    "usage",
    "support",
    "propose",
    "join",
    "private-item",
    "favorites",
    "pins",
    "install-tick",
    "feedback-who",
    "password-change",
    // The authoring and review screens' (131).
    "scope",
    "item-name",
    "name",
    "type",
    "manifest",
    "canvas",
    "submit-together",
    "submit-many",
    "risk",
    "decisions",
    "bump",
    "tag",
    "deprecate-yank",
    "export",
    "approve-many",
    "withdraw",
    "archived",
    "queue-decisions",
    "add-dependency",
    "version-range",
    "which-bump",
    "release-many",
    "waits-on",
    "dependents-listed",
    "ready",
    "personal-review",
    "after-submit",
  ] as const;

  it("are exactly the ones with their words in help.json, and each has a link here", () => {
    expect(Object.keys(english).sort()).toEqual([...MOVED].sort());
    for (const id of MOVED) {
      expect("question" in HELP[id], id).toBe(false);
      expect(HELP[id].href, id).toContain(DOCS_URL);
    }
    // Every other helper still has its words here, so none shows a missing message.
    for (const [id, help] of Object.entries(HELP))
      if (!(MOVED as readonly string[]).includes(id))
        expect("question" in help && "answer" in help, id).toBe(true);
  });

  it("read in the person's language, with the question, the answer and the language's link", async () => {
    const pt = (await import("../../../messages/pt/help.json")).default as typeof english;
    const fr = (await import("../../../messages/fr/help.json")).default as typeof english;
    for (const id of MOVED) {
      const ptHtml = inLocale("pt", () => renderToStaticMarkup(<Help id={id} />));
      expect(ptHtml, id).toContain(pt[id]?.question.replaceAll("'", "&#x27;"));
      expect(ptHtml, id).toContain(`<a href="${localizedDocsHref(HELP[id].href, "pt")}"`);
      const frHtml = inLocale("fr", () => renderToStaticMarkup(<Help id={id} />));
      expect(frHtml, id).toContain(fr[id]?.question.replaceAll("'", "&#x27;"));
      expect(frHtml, id).toContain(`<a href="${localizedDocsHref(HELP[id].href, "fr")}"`);
    }
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English text is left in them`, async () => {
      const html = MOVED.map((id) =>
        inLocale(locale, () => renderToStaticMarkup(<Help id={id} />)),
      ).join("\n");
      expect(await englishLeaks(["help"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["help"], locale, html)).toBeGreaterThan(10);
    });
  }

  it("none of them is left as the English text in pt or fr", async () => {
    const pt = (await import("../../../messages/pt/help.json")).default as typeof english;
    const fr = (await import("../../../messages/fr/help.json")).default as typeof english;
    for (const id of MOVED)
      for (const [locale, messages] of [
        ["pt", pt],
        ["fr", fr],
      ] as const)
        for (const part of ["question", "answer"] as const)
          expect(messages[id]?.[part], `${locale} ${id} ${part}`).not.toBe(english[id]?.[part]);
  });

  it("a helper given a more precise section keeps it", () => {
    const html = inLocale("fr", () =>
      renderToStaticMarkup(<Help id="join" href={docsHref("workspaces", "visibility")} />),
    );
    expect(html).toContain(
      `<a href="${localizedDocsHref(docsHref("workspaces", "visibility"), "fr")}"`,
    );
  });
});
