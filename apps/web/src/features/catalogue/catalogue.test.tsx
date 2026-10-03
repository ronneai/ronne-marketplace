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
  support: { "claude-code": "native", codex: "native", cursor: "native" },
  ...overrides,
});

const pageOf = (overrides: Partial<CataloguePage> = {}): CataloguePage => ({
  entries: [entry()],
  nextCursor: null,
  typeCounts: ITEM_TYPES.map((type) => ({ type, count: type === "hook" ? 1 : 0 })),
  scopes: ["team", "tools"],
  query: { q: "", types: [], scope: null, tool: null, sort: "recent" },
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
      type: ["hook"],
      scope: undefined,
      tool: undefined,
      sort: undefined,
      cursor: "c",
    });
    expect(html).toContain('href="/items/team/fmt"');
    expect(html).toContain(">@team/fmt<");
    expect(html).toContain("v1.2.0");
    expect(html).toContain(">hook<");
    // The date is a <time>, in UTC on the server (049).
    expect(html).toMatch(
      /#format · #lint · published(?:<!-- -->)? <time[^>]*>2026-09-20<\/time> · (?:<!-- -->)?works in Claude Code, Codex, Cursor/,
    );
    expect(html).toContain("rmk install @team/fmt");
    expect(html).toMatch(
      /published(?:<!-- -->)? <time[^>]*>2026-09-20<\/time> · (?:<!-- -->)?works in Claude Code, Codex, Cursor/,
    );
    expect(html).toContain('<option value="cursor">Cursor</option>');
    expect(html).not.toContain("⚠ risk");
    // Every card shows how often it's been downloaded (owner, 2026-10-02).
    expect(html).toMatch(/\d+ installs?</);
  });

  it("puts types, scope and tool in a Filters panel, the active ones beside it, and Sort on the right", async () => {
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({
        query: { q: "x", types: ["hook", "skill"], scope: "team", tool: null, sort: "name" },
      }),
    );
    const html = await render();
    // The button counts the active filters: two types and a scope (the search isn't one).
    expect(html).toMatch(/<summary[^>]*>.*Filters<span[^>]*>3<span class="sr-only"> on<\/span>/);
    // Types: a collapsible list, open when some are chosen, one checkbox per type with its dot,
    // name and count; several can be checked.
    expect(html).toMatch(
      /<details open=""[^>]*><summary[^>]*>.*Type<span[^>]*>Hook, Skill<\/span>/,
    );
    expect(html).toMatch(/<input type="checkbox"[^>]* name="type" checked="" value="hook"/);
    expect(html).toMatch(/<input type="checkbox"[^>]* name="type" checked="" value="skill"/);
    expect(html).toMatch(/<input type="checkbox"[^>]* name="type" value="agent"/);
    expect(html).toMatch(/bg-\(--type-hook\)"><\/span>Hook<span[^>]*>1<\/span>/);
    expect(html).toContain('<option value="tools">@tools</option>');
    expect(html).toContain('<input type="hidden" name="q" value="x"/>');
    expect(html).toContain(">Apply<");
    // Beside the button: each active filter, a link that removes just it, in its own colours.
    const link = (label: string) =>
      html.match(new RegExp(`<a[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";
    expect(html).toContain('aria-label="Active filters"');
    expect(link("Remove the Hook filter")).toContain(
      'href="/catalogue?q=x&amp;type=skill&amp;scope=team&amp;sort=name"',
    );
    expect(link("Remove the Hook filter")).toContain("bg-(--type-hook-subtle)");
    expect(link("Remove the scope filter")).toContain(
      'href="/catalogue?q=x&amp;type=hook&amp;type=skill&amp;sort=name"',
    );
    expect(link("Remove the search")).toContain(
      'href="/catalogue?type=hook&amp;type=skill&amp;scope=team&amp;sort=name"',
    );
    expect(html).toContain(">Clear all<");
    // Sort on the right: three sorts, each saying what it puts first, keeping the rest of the query.
    expect(html).toMatch(/Sort: <span[^>]*>Name<\/span>/);
    expect(html).toContain("Most installs with rmk first");
    expect(html).toMatch(
      /<a[^>]*href="\/catalogue\?q=x&amp;type=hook&amp;type=skill&amp;scope=team&amp;sort=installs"/,
    );
    // The search keeps the filters.
    expect(html).toContain('<input type="hidden" name="type" value="skill"/>');
  });

  it("marks risky, deprecated and uninstallable items", async () => {
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({
        entries: [
          entry({ risky: true, deprecatedMessage: "Use @team/fmt2." }),
          entry({ id: "i2", name: "gone", installable: false }),
          entry({
            id: "i3",
            name: "style",
            support: { "claude-code": "native", codex: "none", cursor: "off" },
          }),
          entry({
            id: "i4",
            name: "nowhere",
            support: { "claude-code": "off", codex: "none", cursor: "none" },
          }),
        ],
      }),
    );
    const html = await render();
    expect(html).toContain("⚠ risk");
    expect(html).toContain(">deprecated<");
    expect(html).toContain("Deprecated: Use @team/fmt2.");
    expect(html).toContain("no installable version");
    expect(html).not.toContain("rmk install @team/gone");
    expect(html).toMatch(/works in Claude Code · \d+ installs?</);
    expect(html).toContain("works in no built-in tool");
  });

  it("explains how items arrive when nothing is published, and says when nothing matches", async () => {
    catalogue.browseCatalogue.mockResolvedValue(pageOf({ entries: [] }));
    const empty = await render();
    expect(empty).toContain("Nothing is published yet.");
    expect(empty).toContain('href="/submissions/new"');
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({
        entries: [],
        query: { q: "zzz", types: [], scope: null, tool: null, sort: "recent" },
      }),
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
  it("reads the first value of each parameter, and every type", () => {
    expect(parseCatalogueQuery({ q: ["a", "b"], type: ["hook", "skill"], sort: "name" })).toEqual({
      q: "a",
      type: ["hook", "skill"],
      scope: undefined,
      tool: undefined,
      sort: "name",
      cursor: undefined,
    });
  });

  it("builds URLs without defaults or empty values", () => {
    const query = { q: "", types: [], scope: null, tool: null, sort: "recent" as const };
    expect(catalogueHref(query)).toBe("/catalogue");
    expect(catalogueHref(query, { types: ["hook", "skill"], sort: "installs" })).toBe(
      "/catalogue?type=hook&type=skill&sort=installs",
    );
    expect(catalogueHref(query, { tool: "codex" })).toBe("/catalogue?tool=codex");
    expect(catalogueHref(query, { q: "a b", sort: "name" })).toBe("/catalogue?q=a+b&sort=name");
  });
});
