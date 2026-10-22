import { ITEM_TYPES } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogueEntry, CataloguePage } from "@/server/domains/items/actions/catalogue";
import { catalogueHref, parseCatalogueQuery } from "./query";

const catalogue = vi.hoisted(() => ({ browseCatalogue: vi.fn() }));
vi.mock("@/server/domains/items/actions/catalogue", () => catalogue);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
const shelves = vi.hoisted(() => ({ favoritedAmong: vi.fn() }));
vi.mock("@/server/domains/shelves/actions/favorites", () => shelves);
vi.mock("@/features/favorites/actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
// The current workspace (120): `shell.current` per test, the real rule for what's shown.
const shell = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("@/app/(app)/shell", async () => {
  const { fakeWorkspaceView } = await import("@/features/current-workspace/testing");
  return { workspaceView: fakeWorkspaceView(shell) };
});

const { default: Catalogue } = await import("@/app/(app)/catalogue/page");
const { CatalogueView } = await import("./CatalogueView");

const entry = (overrides: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: "i1",
  workspace: "global",
  privateWorkspace: false,
  personalWorkspace: false,
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
  personal: null,
  query: {
    q: "",
    types: [],
    scope: null,
    workspace: null,
    tool: null,
    favorites: false,
    sort: "recent",
  },
  ...overrides,
});

const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(await Catalogue({ searchParams: Promise.resolve(params) }));

beforeEach(() => {
  vi.clearAllMocks();
  shelves.favoritedAmong.mockResolvedValue(new Set());
  shell.current = null;
  catalogue.browseCatalogue.mockResolvedValue(pageOf());
});

describe("the catalogue page", () => {
  it("passes the query on, and lists each item with its version, type, date and install command", async () => {
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
    // The date is a <time>, in UTC on the server (049), on the version's row at the card's right.
    expect(html).toMatch(/v1\.2\.0[\s\S]*<time[^>]*>2026-09-20<\/time>/);
    // The cards are the compact ones (Home's, 126): the keywords and the tools are on the item's page,
    // and the install command is behind a copy icon.
    expect(html).not.toContain("#format");
    expect(html).not.toContain("works in");
    expect(html).toContain('aria-label="Copy the install command for @team/fmt"');
    expect(html).toContain('title="rmk install @team/fmt"');
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
          favorites: false,
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
    expect(html).toMatch(/\d+ installs?</);
  });

  it("explains how items arrive when nothing is published, and says when nothing matches", async () => {
    catalogue.browseCatalogue.mockResolvedValue(pageOf({ entries: [] }));
    const empty = await render();
    expect(empty).toContain("Nothing is published yet.");
    expect(empty).toContain('href="/submissions/new"');
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({
        entries: [],
        query: {
          q: "zzz",
          types: [],
          scope: null,
          workspace: null,
          tool: null,
          favorites: false,
          sort: "recent",
        },
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
      favorites: false,
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
      query: {
        q: "x",
        types: [],
        scope: null,
        workspace: "acme",
        tool: null,
        favorites: false,
        sort: "recent",
      },
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
        query: {
          q: "",
          types: [],
          scope: null,
          workspace: "acme",
          tool: null,
          favorites: false,
          sort: "recent",
        },
      }),
    ).toContain('id="catalogue-workspace"');
  });

  it("labels your personal workspace Personal, first (114)", () => {
    const html = view({ workspaces: ["ana", "global", "acme"], personal: "ana" });
    expect(html).toContain('<option value="ana">Personal (ana)</option>');
    expect(html.indexOf('value="ana"')).toBeLessThan(html.indexOf('value="global"'));
  });

  it("keeps a chosen name that isn't a workspace as the selected option, so Apply keeps it", () => {
    const html = view({
      workspaces: ["global", "acme"],
      query: {
        q: "",
        types: [],
        scope: null,
        workspace: "gone",
        tool: null,
        favorites: false,
        sort: "recent",
      },
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

  it("says each item's workspace in its full name; a private one has a lock, a personal one says so (093, 115)", () => {
    const html = view({
      entries: [entry({ workspace: "acme", privateWorkspace: true, scope: "acme-infra" })],
    });
    expect(html).toContain('title="Only acme’s members and root see this item."');
    expect(html).toContain("rmk install @acme/acme-infra/");
    expect(html).toMatch(/<svg[^>]*lucide-lock[^>]*>.*?<\/svg>Private<\/span>/);
    // The card has no Workspace and Scope line: the full name says them (126, owner).
    expect(html).not.toMatch(/Workspace<\/span><a/);
    // Global too: its full name is the scope's and the name's, and there is no lock.
    const global = view();
    expect(global).not.toContain("lucide-lock");
    expect(global).not.toContain("/workspaces/global");
    // A personal workspace says so, without a lock.
    const personal = view({
      entries: [entry({ workspace: "ana", privateWorkspace: true, personalWorkspace: true })],
    });
    expect(personal).toContain("(personal)");
    expect(personal).not.toContain("lucide-lock");
  });
});

describe("the current workspace on the catalogue (120)", () => {
  it("redirects to it when the URL doesn't name one", async () => {
    shell.current = "acme";
    await expect(render({ q: "fmt" })).rejects.toThrow("REDIRECT /catalogue?q=fmt&workspace=acme");
  });

  it("shows only it, says so, and offers Show all back to this page", async () => {
    shell.current = "acme";
    catalogue.browseCatalogue.mockResolvedValue(pageOf({ workspaces: ["global", "acme"] }));
    const html = await render({ workspace: "acme", q: "fmt" });
    expect(catalogue.browseCatalogue).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ workspace: "acme", q: "fmt" }),
    );
    expect(html).toMatch(/Showing <strong[^>]*>acme<\/strong> only/);
    expect(html).toContain(
      'href="/current-workspace?set=&amp;next=%2Fcatalogue%3Fworkspace%3Dacme%26q%3Dfmt"',
    );
    expect(html).toContain("What does this filter?");
  });

  it("says the same for a private workspace as for one that doesn't exist", async () => {
    catalogue.browseCatalogue.mockResolvedValue(pageOf({ workspaces: ["global"] }));
    const secret = await render({ workspace: "secret" });
    const none = await render({ workspace: "zzz" });
    expect(secret).toMatch(/No workspace <strong[^>]*>secret<\/strong> you can see/);
    expect(secret.replaceAll("secret", "X")).toBe(none.replaceAll("zzz", "X"));
  });

  it("lets its clear controls leave the current workspace (an explicit All)", async () => {
    shell.current = "acme";
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({
        workspaces: ["global", "acme"],
        query: {
          q: "x",
          types: [],
          scope: null,
          workspace: "acme",
          tool: null,
          favorites: false,
          sort: "recent",
        },
      }),
    );
    const html = await render({ workspace: "acme", q: "x" });
    expect(html).toMatch(
      /href="\/catalogue\?q=x&amp;workspace="[^>]*aria-label="Remove the workspace filter"|aria-label="Remove the workspace filter"[^>]*href="\/catalogue\?q=x&amp;workspace="/,
    );
    expect(html).not.toContain('href="/catalogue"');
    // The empty state's See every item too.
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({
        entries: [],
        workspaces: ["global", "acme"],
        query: {
          q: "x",
          types: [],
          scope: null,
          workspace: "acme",
          tool: null,
          favorites: false,
          sort: "recent",
        },
      }),
    );
    const empty = await render({ workspace: "acme", q: "x" });
    expect(empty).toContain("See every item");
    expect(empty).not.toContain('href="/catalogue"');
    expect(empty).toMatch(/href="\/catalogue\?workspace="[^>]*>See every item/);
  });

  it("keeps an explicit All in its links and forms while a current workspace is set", async () => {
    shell.current = "acme";
    const html = await render({ workspace: "" });
    expect(catalogue.browseCatalogue).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ workspace: undefined }),
    );
    expect(html).not.toContain("Showing");
    expect(html).toContain('href="/catalogue?workspace=&amp;sort=name"');
    expect(html).toContain('<input type="hidden" name="workspace" value=""/>');
    // Without a current workspace, all is the plain catalogue, as before.
    shell.current = null;
    expect(await render({})).toContain('href="/catalogue?sort=name"');
  });
});

describe("favorites on the catalogue (125)", () => {
  it("asks which of the page's items are favorites, and fills the stars", async () => {
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({ entries: [entry({ id: "i1" }), entry({ id: "i2", name: "lint" })] }),
    );
    shelves.favoritedAmong.mockResolvedValue(new Set(["i2"]));
    const html = await render();
    expect(shelves.favoritedAmong).toHaveBeenCalledWith(expect.any(Headers), ["i1", "i2"]);
    expect(html).toContain('aria-label="Add @team/fmt to favorites"');
    expect(html).toContain('aria-label="Remove @team/lint from favorites"');
  });
});

describe("the Favorites filter (125)", () => {
  it("is a checkbox in the Filters panel, off by default", async () => {
    catalogue.browseCatalogue.mockResolvedValue(pageOf());
    const html = await render();
    expect(html).toContain('name="favorites"');
    expect(html).toContain("Only my favorites");
    expect(html).not.toMatch(/name="favorites"[^>]*checked/);
  });

  it("is read from ?favorites=1, passed on, and shown as a chip that removes it", async () => {
    catalogue.browseCatalogue.mockResolvedValue(
      pageOf({
        query: {
          q: "",
          types: [],
          scope: null,
          workspace: null,
          tool: null,
          favorites: true,
          sort: "recent",
        },
      }),
    );
    const html = await render({ favorites: "1" });
    expect(catalogue.browseCatalogue).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ favorites: "1" }),
    );
    expect(html).toContain('aria-label="Remove the favorites filter"');
    expect(html).toMatch(/name="favorites"[^>]*checked/);
    // It counts as an active filter, and the search keeps it.
    expect(html).toContain('<input type="hidden" name="favorites" value="1"/>');
  });

  it("keeps it in the links for sort and paging, and Clear leaves it", () => {
    const query = {
      q: "",
      types: [],
      scope: null,
      workspace: null,
      tool: null,
      favorites: true,
      sort: "recent" as const,
    };
    expect(catalogueHref(query)).toBe("/catalogue?favorites=1");
    expect(catalogueHref(query, { sort: "name" })).toBe("/catalogue?favorites=1&sort=name");
    expect(catalogueHref(query, { cursor: "c2" })).toBe("/catalogue?favorites=1&cursor=c2");
    expect(catalogueHref(query, { favorites: false })).toBe("/catalogue");
  });

  it("is read from the address only when it is exactly 1", () => {
    expect(parseCatalogueQuery({ favorites: "1" }).favorites).toBe("1");
    expect(parseCatalogueQuery({ favorites: "0" }).favorites).toBeUndefined();
    expect(parseCatalogueQuery({ favorites: "true" }).favorites).toBeUndefined();
    expect(parseCatalogueQuery({}).favorites).toBeUndefined();
  });
});

/** The opening tag of the link with this accessible name, whatever order its attributes come in. */
const anchor = (html: string, label: string) =>
  html.match(new RegExp(`<a [^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("the grid and the list (126, owner)", () => {
  it("is the grid by default: compact cards, with the grid button current", async () => {
    const html = await render();
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("grid-cols-[repeat(auto-fill");
    expect(html).not.toContain("works in");
    expect(anchor(html, "List view")).toContain('href="/catalogue?view=list"');
    expect(anchor(html, "List view")).not.toContain("aria-current");
    expect(anchor(html, "Grid view")).toContain('aria-current="page"');
  });

  it("is a list with ?view=list: the full cards, one to a row, with the list button current", async () => {
    const html = await render({ view: "list" });
    expect(html).not.toContain("line-clamp-2");
    expect(html).not.toContain("grid-cols-[repeat(auto-fill");
    // The full card: keywords, the tools, the install command and the place line.
    expect(html).toContain("#format");
    expect(html).toContain("works in Claude Code, Codex, Cursor");
    expect(html).toMatch(/<code[^>]*>[\s\S]*rmk install @team\/fmt/);
    expect(html).toMatch(/Workspace<\/span><a/);
    expect(anchor(html, "List view")).toContain('aria-current="page"');
    expect(anchor(html, "Grid view")).toContain('href="/catalogue"');
    expect(anchor(html, "Grid view")).not.toContain("aria-current");
  });

  it("anything but list is the grid", async () => {
    expect(await render({ view: "table" })).toContain("line-clamp-2");
  });

  it("keeps the list through sorting, the pager, and a new search or filter", async () => {
    catalogue.browseCatalogue.mockResolvedValue(pageOf({ nextCursor: "c2" }));
    const html = await render({ view: "list" });
    expect(html).toContain('href="/catalogue?sort=installs&amp;view=list"');
    expect(html).toContain('href="/catalogue?view=list&amp;cursor=c2"');
    // The search and the Filters forms are GET forms: the view rides along.
    expect(html.match(/<input type="hidden" name="view" value="list"\/>/g)).toHaveLength(2);
    const grid = await render();
    expect(grid).not.toContain('name="view"');
    expect(grid).not.toContain("view=list&amp;cursor");
  });

  it("writes the layout into links, and leaves the grid out", () => {
    const query = pageOf().query;
    expect(catalogueHref({ ...query, layout: "list" }, { sort: "name" })).toBe(
      "/catalogue?sort=name&view=list",
    );
    expect(catalogueHref({ ...query, layout: "grid" }, { sort: "name" })).toBe(
      "/catalogue?sort=name",
    );
    expect(catalogueHref(query, { layout: "list" })).toBe("/catalogue?view=list");
  });
});
