import { ITEM_TYPES } from "@ronneai/core";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/server/domains/identity/models/locale";
import type { CatalogueEntry, CataloguePage } from "@/server/domains/items/actions/catalogue";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { CatalogueView } = await import("./CatalogueView");

/** The Catalogue speaks the person's language (feature 130). */
const view = (locale: Locale, node: ReactElement) =>
  inLocale(locale, () => renderToStaticMarkup(node));

const entry: CatalogueEntry = {
  id: "i1",
  workspace: "acme",
  privateWorkspace: false,
  personalWorkspace: false,
  scope: "team",
  name: "fmt",
  type: "hook",
  version: "1.2.0",
  description: "Formats files after an edit.",
  keywords: ["format"],
  publishedAt: new Date("2026-09-20T10:00:00Z"),
  lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
  risky: false,
  deprecatedMessage: null,
  installable: true,
  downloadCount: 3,
  support: { "claude-code": "native", codex: "native", cursor: "native" },
};

const pageOf = (overrides: Partial<CataloguePage> = {}): CataloguePage => ({
  entries: [entry],
  nextCursor: null,
  typeCounts: ITEM_TYPES.map((type) => ({ type, count: type === "hook" ? 1 : 0 })),
  scopes: ["team"],
  workspaces: ["acme", "global"],
  personal: "acme",
  query: { q: "", types: [], scope: null, workspace: null, tool: null, sort: "recent" },
  ...overrides,
});

const filtered = pageOf({
  nextCursor: "c2",
  query: {
    q: "lint",
    types: ["hook"],
    scope: "team",
    workspace: "acme",
    tool: "codex",
    sort: "installs",
  },
});
const noMatch = pageOf({ entries: [], query: { ...pageOf().query, q: "zzz" } });
const nothing = pageOf({ entries: [] });

describe("the Catalogue in three languages", () => {
  const cases: Record<Locale, string[]> = {
    en: ["Filters", "Recently published", "Apply", "Search"],
    pt: ["Filtros", "Publicados recentemente", "Aplicar", "Pesquisar", "Espaço de trabalho"],
    fr: ["Filtres", "Publiés récemment", "Appliquer", "Rechercher", "Espace de travail"],
  };
  for (const locale of ["en", "pt", "fr"] as const) {
    it(`${locale}: search, filters and sort`, () => {
      const html = view(locale, <CatalogueView page={pageOf()} paged={false} />);
      for (const text of cases[locale]) expect(html, text).toContain(text);
    });
  }

  it("the active filters and the sort summary read in the language", () => {
    const pt = view("pt", <CatalogueView page={filtered} paged />);
    expect(pt).toContain('aria-label="Remover o filtro Hook"');
    expect(pt).toContain('aria-label="Remover a pesquisa"');
    expect(pt).toContain("Ordenar: <span");
    expect(pt).toContain("Mais instalados");
    expect(pt).toContain("Pessoal (acme)");
    expect(pt).toContain("Primeira página");
    expect(pt).toContain("Próxima página");
    const fr = view("fr", <CatalogueView page={filtered} paged />);
    expect(fr).toContain('aria-label="Retirer le filtre Hook"');
    expect(fr).toContain("Trier : <span");
    expect(fr).toContain("Les plus installés");
    expect(fr).toContain("Personnel (acme)");
    expect(fr).toContain("Tout effacer");
  });

  it("a type filter names the type as rmk prints it, and the type count follows the language", () => {
    expect(view("fr", <CatalogueView page={pageOf()} paged={false} />)).toContain("tous 1");
    expect(view("pt", <CatalogueView page={pageOf()} paged={false} />)).toContain("todos 1");
  });

  it("the empty states say what to do, with the link inside the sentence", () => {
    const none = view("pt", <CatalogueView page={noMatch} paged={false} />);
    expect(none).toContain("Nenhum item corresponde.");
    expect(none).toMatch(/<a [^>]*>Ver todos os itens<\/a>\./);
    const empty = view("fr", <CatalogueView page={nothing} paged={false} />);
    expect(empty).toContain("Rien n’est encore publié.");
    expect(empty).toContain('<code class="font-mono">rmk</code>');
    expect(empty).toContain("Soumettre un élément");
  });

  it("a search typed as a placeholder is shown as typed", () => {
    const html = view(
      "pt",
      <CatalogueView
        page={pageOf({ query: { ...pageOf().query, q: "{total} <b>x</b>" } })}
        paged={false}
      />,
    );
    expect(html).toContain("{total}");
    expect(html).not.toContain("<b>x</b>");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English text is left`, async () => {
      const html = [
        view(locale, <CatalogueView page={pageOf()} paged={false} />),
        view(locale, <CatalogueView page={filtered} paged />),
        view(locale, <CatalogueView page={noMatch} paged={false} />),
        view(locale, <CatalogueView page={nothing} paged={false} />),
      ].join("\n");
      expect(await englishLeaks(["catalogue", "types"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["catalogue", "types"], locale, html)).toBeGreaterThan(15);
    });
  }
});
