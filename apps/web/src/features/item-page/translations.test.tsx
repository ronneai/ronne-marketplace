import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";
import { itemPageData, versionRow } from "./fixtures";

const versions = vi.hoisted(() => ({ itemPage: vi.fn(), versionContents: vi.fn() }));
vi.mock("@/server/domains/items/actions/versions", () => versions);
vi.mock("@/server/domains/usage/actions/usage", () => ({ itemUsage: vi.fn() }));
vi.mock("@/server/domains/items/actions/catalogue", () => ({ dependencyFacts: vi.fn() }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/items/team/github",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./actions", () => ({ proposeChangeAction: vi.fn() }));

const { default: Item } = await import("@/app/(app)/items/[scope]/[name]/page");

/** The item page's header, tabs, Tools, README, Dependencies and What it can do (feature 130). */
const render = async (locale: Locale, query: { tab?: string; version?: string } = {}) => {
  const tree = await Item({
    params: Promise.resolve({ scope: "team", name: "github" }),
    searchParams: Promise.resolve(query),
  });
  return inLocale(locale, () => renderToStaticMarkup(tree));
};

/** The page showing 1.0.0 (deprecated and yanked), as `?version=1.0.0` does. */
const showingOld = (overrides: Parameters<typeof itemPageData>[0] = {}) => {
  const old = itemPageData().versions[1] ?? versionRow();
  return itemPageData({ shown: { ...itemPageData().shown, ...old }, ...overrides });
};

beforeEach(() => {
  vi.clearAllMocks();
  versions.itemPage.mockResolvedValue(itemPageData());
});

describe("the item page in three languages", () => {
  it("the header and tab strip", async () => {
    const en = await render("en", { tab: "readme" });
    expect(en).toContain(">Dependencies<");
    expect(en).toContain("license MIT");
    expect(en).toContain("by Rae Releaser");
    const pt = await render("pt", { tab: "readme" });
    for (const text of [
      "Visão geral",
      ">Dependências<",
      "Arquivos",
      "Funciona em",
      "licença MIT",
      "por Rae Releaser",
      "publicado em",
      "Propor uma alteração",
    ])
      expect(pt, text).toContain(text);
    const fr = await render("fr", { tab: "readme" });
    for (const text of [
      "Aperçu",
      ">Dépendances<",
      "Fichiers",
      "Fonctionne dans",
      "licence MIT",
      "par Rae Releaser",
      "publié le",
      "Proposer une modification",
    ])
      expect(fr, text).toContain(text);
  });

  it("another version: the notice names it, its state and the way back", async () => {
    versions.itemPage.mockResolvedValue(showingOld());
    const pt = await render("pt", { tab: "readme", version: "1.0.0" });
    expect(pt).toContain("Você está vendo a 1.0.0, não a mais recente (1.1.0).");
    expect(pt).toContain("Ela foi retirada: Breaks on Windows.");
    expect(pt).toContain("Mostrar a mais recente");
    const fr = await render("fr", { tab: "readme", version: "1.0.0" });
    expect(fr).toContain("Vous consultez la 1.0.0, pas la plus récente (1.1.0).");
    expect(fr).toContain("Elle a été retirée : Breaks on Windows.");
    expect(fr).toContain("Afficher la plus récente");
  });

  it("without a latest tag the notice says the listed version", async () => {
    versions.itemPage.mockResolvedValue(showingOld({ latest: null, listed: "1.1.0" }));
    const pt = await render("pt", { tab: "readme", version: "1.0.0" });
    expect(pt).toContain("não a versão listada (1.1.0)");
    expect(pt).toContain("Mostrar a 1.1.0");
    const fr = await render("fr", { tab: "readme", version: "1.0.0" });
    expect(fr).toContain("pas la version listée (1.1.0)");
    expect(fr).toContain("Afficher la 1.1.0");
    const en = await render("en", { tab: "readme", version: "1.0.0" });
    expect(en).toContain("not the listed version (1.1.0).");
    expect(en).toContain("Show 1.1.0");
  });

  it("a deprecated version that is not yanked, and one that is neither, say so in each language", async () => {
    const old = itemPageData().versions[1] ?? versionRow();
    const deprecated = { ...itemPageData().shown, ...old, yankedAt: null, yankReason: null };
    versions.itemPage.mockResolvedValue(itemPageData({ shown: deprecated }));
    const pt = await render("pt", { tab: "readme", version: "1.0.0" });
    expect(pt).toContain("Ela está obsoleta: Use 1.1.0 or later.");
    expect(pt).not.toContain("Ela foi retirada");
    const fr = await render("fr", { tab: "readme", version: "1.0.0" });
    expect(fr).toContain("Elle est obsolète : Use 1.1.0 or later.");
    expect(fr).not.toContain("Elle a été retirée");
    expect(await render("en", { tab: "readme", version: "1.0.0" })).toContain(
      "It’s deprecated: Use 1.1.0 or later.",
    );
    // Neither yanked nor deprecated: the title and the way back, and no state sentence.
    const plain = { ...deprecated, deprecatedMessage: null };
    versions.itemPage.mockResolvedValue(itemPageData({ shown: plain }));
    for (const [locale, title, back, state] of [
      ["en", "You’re looking at 1.0.0, not latest (1.1.0).", "Show latest", "deprecated"],
      [
        "pt",
        "Você está vendo a 1.0.0, não a mais recente (1.1.0).",
        "Mostrar a mais recente",
        "obsoleta",
      ],
      [
        "fr",
        "Vous consultez la 1.0.0, pas la plus récente (1.1.0).",
        "Afficher la plus récente",
        "obsolète",
      ],
    ] as const) {
      const html = await render(locale, { tab: "readme", version: "1.0.0" });
      expect(html, locale).toContain(title);
      expect(html, locale).toContain(back);
      expect(html, locale).not.toContain(`${state}:`);
      expect(html, locale).not.toContain(`${state} :`);
    }
  });

  it("the page titles follow the language", async () => {
    const titles = [
      (await import("@/app/(app)/items/[scope]/[name]/page")).generateMetadata,
      (await import("@/app/(app)/items/[scope]/[name]/versions/page")).generateMetadata,
      (await import("@/app/(app)/workspaces/[name]/items/[scope]/[item]/page")).generateMetadata,
      (await import("@/app/(app)/workspaces/[name]/items/[scope]/[item]/versions/page"))
        .generateMetadata,
    ];
    const expected = {
      en: ["Item", "Versions", "Item", "Versions"],
      pt: ["Item", "Versões", "Item", "Versões"],
      fr: ["Élément", "Versions", "Élément", "Versions"],
    };
    for (const locale of ["en", "pt", "fr"] as const)
      for (const [index, generate] of titles.entries())
        expect(await inLocale(locale, () => generate())).toEqual({
          title: `${expected[locale][index]} · Ronne AI Marketplace`,
        });
  });

  it("the Works in tab says what each level means", async () => {
    const en = await render("en", { tab: "tools" });
    expect(en).toContain("supported");
    const pt = await render("pt", { tab: "tools" });
    expect(pt).toContain("compatível");
    expect(pt).toContain("Vai para ");
    const fr = await render("fr", { tab: "tools" });
    expect(fr).toContain("pris en charge");
    expect(fr).toContain("Va dans ");
  });

  it("a name or keyword that looks like a placeholder is shown as typed", async () => {
    versions.itemPage.mockResolvedValue(itemPageData({ ownerName: "{owner} <b>x</b>" }));
    const pt = await render("pt", { tab: "readme" });
    expect(pt).toContain("por {owner} &lt;b&gt;x&lt;/b&gt;");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English text is left on the tabs this task moves`, async () => {
      const tabs = ["readme", "tools", "dependencies", "risks"] as const;
      const pages: string[] = [];
      for (const tab of tabs) {
        versions.itemPage.mockResolvedValue(itemPageData());
        pages.push(await render(locale, { tab }));
        versions.itemPage.mockResolvedValue(showingOld());
        pages.push(await render(locale, { tab, version: "1.0.0" }));
      }
      const html = pages.join("\n");
      expect(await englishLeaks(["item", "catalogue"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["item", "catalogue"], locale, html)).toBeGreaterThan(8);
    });
  }
});
