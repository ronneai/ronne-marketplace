import { ITEM_TYPES } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueEntry, CataloguePage } from "@/server/domains/items/actions/catalogue";
import { catalogueHref, parseCatalogueQuery } from "./query";

const catalogue = vi.hoisted(() => ({ browseCatalogue: vi.fn() }));
vi.mock("@/server/domains/items/actions/catalogue", () => catalogue);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { default: Catalogue } = await import("@/app/(app)/catalogue/page");

const entry = (overrides: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: "i1",
  scope: "team",
  name: "fmt",
  type: "hook",
  version: "1.2.0",
  description: "Formats files after an edit.",
  keywords: ["format", "lint"],
  publishedAt: new Date("2026-09-20T10:00:00Z"),
  lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
  risky: false,
  deprecatedMessage: null,
  installable: true,
  downloadCount: 3,
  ...overrides,
});

const pageOf = (overrides: Partial<CataloguePage> = {}): CataloguePage => ({
  entries: [entry()],
  nextCursor: null,
  typeCounts: ITEM_TYPES.map((type) => ({ type, count: type === "hook" ? 1 : 0 })),
  scopes: ["team", "tools"],
  query: { q: "", type: null, scope: null, sort: "recent" },
  ...overrides,
});

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(await Catalogue({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  vi.clearAllMocks();
  catalogue.browseCatalogue.mockResolvedValue(pageOf());
});

describe("the catalogue page", () => {
  it("passes the query on, and lists each item with its version, type, keywords and install command", async () => {
    const html = await render({ q: "fmt", type: "hook", cursor: "c" });
    expect(catalogue.browseCatalogue).toHaveBeenCalledWith(expect.any(Headers), {
      q: "fmt",
      type: "hook",
      scope: undefined,
      sort: undefined,
      cursor: "c",
    });
    expect(html).toContain('href="/items/team/fmt"');
    expect(html).toContain(">@team/fmt<");
    expect(html).toContain("v1.2.0");
    expect(html).toContain(">hook<");
    expect(html).toContain("#format · #lint · published 2026-09-20");
    expect(html).toContain("rmk install @team/fmt");
    expect(html).not.toContain("⚠ risk");
    expect(html).not.toContain("downloads");
  });

  it("shows the type chips with counts, the scopes, and the sorts, keeping the rest of the query", async () => {
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({ query: { q: "x", type: "hook", scope: "team", sort: "name" } }),
    );
    const html = await render();
    expect(html).toMatch(
      /href="\/catalogue\?q=x&amp;scope=team&amp;sort=name"[^>]*>All <span[^>]*>\(1\)/,
    );
    expect(html).toMatch(/aria-current="page"[^>]*>hook <span[^>]*>\(1\)/);
    expect(html).toContain('href="/catalogue?q=x&amp;type=skill&amp;scope=team&amp;sort=name"');
    expect(html).toContain('<option value="tools">@tools</option>');
    expect(html).toContain('href="/catalogue?q=x&amp;type=hook&amp;scope=team"');
    expect(html).toContain('<input type="hidden" name="type" value="hook"/>');
    expect(html).toContain(">Clear<");
  });

  it("marks risky, deprecated and uninstallable items", async () => {
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({
        entries: [
          entry({ risky: true, deprecatedMessage: "Use @team/fmt2." }),
          entry({ id: "i2", name: "gone", installable: false }),
        ],
      }),
    );
    const html = await render();
    expect(html).toContain("⚠ risk");
    expect(html).toContain(">deprecated<");
    expect(html).toContain("Deprecated: Use @team/fmt2.");
    expect(html).toContain("no installable version");
    expect(html).not.toContain("rmk install @team/gone");
  });

  it("explains how items arrive when nothing is published, and says when nothing matches", async () => {
    catalogue.browseCatalogue.mockResolvedValue(pageOf({ entries: [] }));
    const empty = await render();
    expect(empty).toContain("Nothing is published yet.");
    expect(empty).toContain('href="/submissions/new"');
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({ entries: [], query: { q: "zzz", type: null, scope: null, sort: "recent" } }),
    );
    expect(await render({ q: "zzz" })).toContain("No items match.");
  });

  it("links to the next page, and back to the first", async () => {
    catalogue.browseCatalogue.mockResolvedValue(pageOf({ nextCursor: "abc" }));
    const html = await render({ cursor: "prev" });
    expect(html).toContain('href="/catalogue?cursor=abc"');
    expect(html).toMatch(/href="\/catalogue"[^>]*>First page</);
  });
});

describe("catalogue query helpers", () => {
  it("reads the first value of each parameter", () => {
    expect(parseCatalogueQuery({ q: ["a", "b"], sort: "name" })).toEqual({
      q: "a",
      type: undefined,
      scope: undefined,
      sort: "name",
      cursor: undefined,
    });
  });

  it("builds URLs without defaults or empty values", () => {
    const query = { q: "", type: null, scope: null, sort: "recent" as const };
    expect(catalogueHref(query)).toBe("/catalogue");
    expect(catalogueHref(query, { q: "a b", sort: "name" })).toBe("/catalogue?q=a+b&sort=name");
  });
});
