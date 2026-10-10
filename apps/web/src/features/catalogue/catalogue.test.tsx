import { ITEM_TYPES } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueEntry, CataloguePage } from "@/server/domains/items/actions/catalogue";
import { catalogueHref, parseCatalogueQuery } from "./query";

const catalogue = vi.hoisted(() => ({ browseCatalogue: vi.fn() }));
vi.mock("@/server/domains/items/actions/catalogue", () => catalogue);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { default: Catalogue } = await import("@/app/(app)/catalogue/page");
const { CatalogueView } = await import("./CatalogueView");

const entry = (overrides: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: "i1",
  workspace: "global",
  privateWorkspace: false,
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
  workspaces: ["global"],
  query: { q: "", types: [], scope: null, workspace: null, tool: null, sort: "recent" },
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
        query: {
          q: "x",
          types: ["hook", "skill"],
          scope: "team",
          workspace: null,
          tool: null,
          sort: "name",
        },
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
        query: { q: "zzz", types: [], scope: null, workspace: null, tool: null, sort: "recent" },
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
      workspace: undefined,
      tool: undefined,
      sort: "name",
      cursor: undefined,
    });
    expect(parseCatalogueQuery({ workspace: "acme" }).workspace).toBe("acme");
  });

  it("builds URLs without defaults or empty values", () => {
    const query = {
      q: "",
      types: [],
      scope: null,
      workspace: null,
      tool: null,
      sort: "recent" as const,
    };
    expect(catalogueHref(query)).toBe("/catalogue");
    expect(catalogueHref(query, { types: ["hook", "skill"], sort: "installs" })).toBe(
      "/catalogue?type=hook&type=skill&sort=installs",
    );
    expect(catalogueHref(query, { tool: "codex" })).toBe("/catalogue?tool=codex");
    expect(catalogueHref(query, { workspace: "acme", scope: "acme-infra" })).toBe(
      "/catalogue?scope=acme-infra&workspace=acme",
    );
    expect(catalogueHref(query, { q: "a b", sort: "name" })).toBe("/catalogue?q=a+b&sort=name");
  });
});

describe("workspaces in the catalogue (090)", () => {
  const view = (overrides: Partial<CataloguePage> = {}) =>
    renderToStaticMarkup(<CatalogueView page={pageOf(overrides)} paged={false} />);

  it("offers the Workspace filter, with every workspace, once there's more than global", () => {
    expect(view()).not.toContain('name="workspace"');
    const html = view({ workspaces: ["global", "acme"] });
    expect(html).toContain('id="catalogue-workspace"');
    expect(html).toContain("All workspaces");
    expect(html.indexOf('value="global"')).toBeLessThan(html.indexOf('value="acme"'));
  });

  it("shows a chosen workspace as an active filter, kept by search and cleared with the rest", () => {
    const html = view({
      workspaces: ["global", "acme"],
      query: { q: "x", types: [], scope: null, workspace: "acme", tool: null, sort: "recent" },
    });
    expect(html).toContain('aria-label="Remove the workspace filter"');
    expect(html).toContain('href="/catalogue?q=x"');
    expect(html).toContain('<input type="hidden" name="workspace" value="acme"/>');
    expect(html).toContain('<option value="acme" selected="">acme</option>');
    expect(html).toMatch(/>Clear all</);
    // Even when only one workspace holds items, a chosen one stays visible and removable.
    expect(
      view({
        workspaces: ["acme"],
        query: { q: "", types: [], scope: null, workspace: "acme", tool: null, sort: "recent" },
      }),
    ).toContain('id="catalogue-workspace"');
  });

  it("keeps a chosen name that isn't a workspace as the selected option, so Apply keeps it", () => {
    const html = view({
      workspaces: ["global", "acme"],
      query: { q: "", types: [], scope: null, workspace: "gone", tool: null, sort: "recent" },
    });
    expect(html).toContain('<option value="gone" selected="">gone</option>');
    expect(html).toContain('aria-label="Remove the workspace filter"');
  });

  it("names a workspace other than global once, in the item's full name (118)", () => {
    const acme = view({ entries: [entry({ workspace: "acme", scope: "acme-infra" })] });
    expect(acme).not.toMatch(/acme<span aria-hidden="true"> · <\/span>/);
    expect(acme).toContain("@acme/acme-infra/fmt");
    expect(acme).toContain('href="/workspaces/acme/items/acme-infra/fmt"');
    expect(view()).not.toContain('<span aria-hidden="true"> · </span>');
  });

  it("marks a private workspace's item with a lock and Private, its full name naming acme (093, 118)", () => {
    const html = view({
      entries: [entry({ workspace: "acme", privateWorkspace: true, scope: "acme-infra" })],
    });
    expect(html).toContain('title="Only acme&#x27;s members and root see this item."');
    expect(html).toMatch(
      /lucide-lock[^>]*>.*<\/svg>Private<span aria-hidden="true"> · <\/span><span class="sr-only">, <\/span><\/span><a[^>]*>@acme\/acme-infra\//,
    );
    const open = view({ entries: [entry({ workspace: "acme", scope: "acme-infra" })] });
    expect(open).not.toContain("lucide-lock");
    // Public: the name alone says the workspace, once.
    expect(open).not.toMatch(/>acme<span aria-hidden="true"> · /);
  });
});
