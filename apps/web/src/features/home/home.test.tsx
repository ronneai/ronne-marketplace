import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CatalogueEntry, HomeLists } from "@/server/domains/items/actions/catalogue";

vi.mock("@/server/domains/items/actions/catalogue", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { inLocale } = await import("@/test/intl");
const { HomeView } = await import("./HomeView");
const english = (await import("../../../messages/en/home.json")).default;
const portuguese = (await import("../../../messages/pt/home.json")).default;
const french = (await import("../../../messages/fr/home.json")).default;

const entry = (name: string): CatalogueEntry => ({
  id: name,
  workspace: "global",
  privateWorkspace: false,
  personalWorkspace: false,
  scope: "team",
  name,
  type: "skill",
  version: "1.0.0",
  description: `The ${name} skill.`,
  keywords: [],
  publishedAt: new Date("2026-09-20T10:00:00Z"),
  lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
  risky: false,
  deprecatedMessage: null,
  installable: true,
  downloadCount: 0,
  support: { "claude-code": "native", codex: "native", cursor: "native" },
});

const none = { drafts: 0, changesRequested: 0, needsReview: 0 };
const everything = { drafts: 2, changesRequested: 1, needsReview: 3 };
const populated: HomeLists = {
  recent: [entry("fmt")],
  mostUsed: [{ ...entry("lint"), downloadCount: 4 }],
  types: ["skill", "rule"],
};
const view = (node: ReactElement, locale: "en" | "pt" | "fr" = "en") =>
  inLocale(locale, () => renderToStaticMarkup(node));
const at = (html: string, text: string) => {
  const index = html.indexOf(text);
  expect(index, `"${text}" is on the page`).toBeGreaterThanOrEqual(0);
  return index;
};

describe("Home's order (124)", () => {
  const slots = {
    gettingStarted: <section>SLOT-GETTING-STARTED</section>,
    favorites: <section>SLOT-FAVORITES</section>,
    pinned: <section>SLOT-PINNED</section>,
  };

  it("runs search, getting started, waiting for you, favorites, pinned, recent, most used", () => {
    const html = view(<HomeView lists={populated} forYou={everything} slots={slots} />);
    const order = [
      'id="home-search"',
      "SLOT-GETTING-STARTED",
      english.waiting.title,
      "SLOT-FAVORITES",
      "SLOT-PINNED",
      english.recent.title,
      english.mostUsed.title,
    ].map((text) => at(html, text));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("draws nothing for a section without content: no heading, no 'None'", () => {
    const html = view(
      <HomeView
        lists={{ recent: [entry("fmt")], mostUsed: [], types: [] }}
        forYou={none}
        slots={{ favorites: null, pinned: undefined }}
      />,
    );
    for (const text of [
      english.waiting.title,
      english.mostUsed.title,
      english.types.label,
      "SLOT",
      "None",
    ])
      expect(html, text).not.toContain(text);
    expect(html).toContain(english.recent.title);
  });

  it("shows Waiting for you only for a count above zero, each line with its own link", () => {
    const one = view(<HomeView lists={populated} forYou={{ ...none, needsReview: 1 }} />);
    expect(one).toMatch(/href="\/reviews"[^>]*>1 submission waits for review\./);
    expect(one).not.toContain("draft");
    const all = view(<HomeView lists={populated} forYou={everything} />);
    expect(all).toContain("You have 2 drafts in progress.");
    expect(all).toContain("1 submission of yours needs changes.");
    expect(all).toContain("3 submissions wait for review.");
  });

  it("names the heading level of each section under the page's h1", () => {
    const html = view(<HomeView lists={populated} forYou={everything} />);
    expect(html.match(/<h2/g)).toHaveLength(3);
    expect(html).toMatch(/<h3[^>]*><a [^>]*href="\/items\/team\/fmt"/);
  });
});

describe("Search first (124)", () => {
  it("offers a link per type that has items, into the catalogue filtered by it", () => {
    const html = view(<HomeView lists={populated} forYou={none} />);
    expect(html).toContain(`aria-label="${english.types.label}"`);
    expect(html).toMatch(/href="\/catalogue\?type=skill"[^>]*>.*Skill/);
    expect(html).toMatch(/href="\/catalogue\?type=rule"[^>]*>.*Rule/);
    expect(html).not.toContain("type=agent");
    expect(at(html, 'id="home-search"')).toBeLessThan(at(html, "type=skill"));
  });

  it("keeps the search box when the catalogue is empty, with no type links", () => {
    const html = view(<HomeView lists={{ recent: [], mostUsed: [], types: [] }} forYou={none} />);
    expect(html).toMatch(/<form[^>]*action="\/catalogue"/);
    expect(html).not.toContain("?type=");
  });
});

describe("Home in three languages (124)", () => {
  it("reads in Portuguese and French, with the plural of each count", () => {
    for (const [locale, words] of [
      ["pt", portuguese],
      ["fr", french],
    ] as const) {
      const html = view(<HomeView lists={populated} forYou={everything} />, locale);
      for (const text of [
        words.search.label,
        words.types.label,
        words.waiting.title,
        words.recent.title,
        words.recent.seeAll,
        words.mostUsed.title,
      ])
        expect(html, `${locale}: ${text}`).toContain(text);
      for (const text of [english.search.label, english.waiting.title, english.recent.title])
        expect(html, `${locale} leaks: ${text}`).not.toContain(text);
    }
    const pt = view(<HomeView lists={populated} forYou={everything} />, "pt");
    expect(pt).toContain("Você tem 2 rascunhos em andamento.");
    expect(pt).toContain("1 submissão sua precisa de alterações.");
    expect(pt).toContain("3 submissões aguardam revisão.");
    const fr = view(<HomeView lists={populated} forYou={{ ...none, drafts: 1 }} />, "fr");
    expect(fr).toContain("Vous avez 1 brouillon en cours.");
  });

  it("explains an empty registry in each language, with rmk in mono", () => {
    for (const [locale, words] of [
      ["en", english],
      ["pt", portuguese],
      ["fr", french],
    ] as const) {
      const html = view(
        <HomeView lists={{ recent: [], mostUsed: [], types: [] }} forYou={none} />,
        locale,
      );
      expect(html).toContain(words.empty.title);
      expect(html).toContain(words.empty.submit);
      expect(html).toContain('<code class="font-mono">rmk</code>');
    }
  });
});
