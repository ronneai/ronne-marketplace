import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { ScopeNameTakenError } from "@/server/domains/items/exceptions/errors";
import type { Scope } from "@/server/domains/items/models/scope";

const scopes = vi.hoisted(() => ({
  createScope: vi.fn(),
  updateScopeDescription: vi.fn(),
  pageScopes: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/items/actions/scopes", () => scopes);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { ScopesTable } = await import("./ScopesTable");
const { parseListQuery } = await import("@/components/ui/data-table/list-query");
const { workspaceScopesList, scopesQueryOf } = await import("./list");
const { CreateScopeDialog } = await import("./ScopeDialogs");
const { default: nextConfig } = await import("../../../next.config");

const LIST = workspaceScopesList("/workspaces/global");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const scope = (overrides: Partial<Scope> = {}): Scope => ({
  id: "s1",
  name: "platform",
  description: "Shared platform tools.",
  workspace: { id: "00000000000000000000000000", name: "global" },
  createdBy: { id: "r", email: "root@example.com" },
  createdAt: new Date("2026-09-20T10:00:00Z"),
  ...overrides,
});

const ACME = { id: "w1", name: "acme" };

beforeEach(() => vi.clearAllMocks());

describe("scope actions", () => {
  it("creates a scope and revalidates the workspaces' pages", async () => {
    scopes.createScope.mockResolvedValue(scope());
    expect(
      await actions.createScopeFromForm({}, form({ name: "@Platform", description: "Tools." })),
    ).toEqual({ done: "Created @platform." });
    expect(scopes.createScope).toHaveBeenCalledWith(expect.any(Headers), {
      name: "@Platform",
      description: "Tools.",
      workspaceId: undefined,
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/workspaces", "layout");
  });

  it("creates a scope in the workspace chosen, and says which (090)", async () => {
    scopes.createScope.mockResolvedValue(
      scope({ name: "acme-infra", workspace: { id: "w1", name: "acme" } }),
    );
    expect(
      await actions.createScopeFromForm(
        {},
        form({ name: "acme-infra", description: "Infra.", workspaceId: "w1" }),
      ),
    ).toEqual({ done: "Created @acme-infra in acme." });
    expect(scopes.createScope).toHaveBeenCalledWith(expect.any(Headers), {
      name: "acme-infra",
      description: "Infra.",
      workspaceId: "w1",
    });
  });

  it("shows domain and permission errors, and rethrows anything else", async () => {
    scopes.createScope.mockRejectedValueOnce(new ScopeNameTakenError("platform"));
    expect((await actions.createScopeFromForm({}, form({}))).error).toBe(
      "The scope @platform already exists.",
    );
    scopes.updateScopeDescription.mockRejectedValueOnce(new ForbiddenError("scopes.manage"));
    expect((await actions.updateScopeFromForm({}, form({ name: "x" }))).error).toContain(
      "permission",
    );
    scopes.createScope.mockRejectedValueOnce(new Error("database down"));
    await expect(actions.createScopeFromForm({}, form({}))).rejects.toThrow("database down");
  });
});

describe("ScopesTable (061)", () => {
  const table = (params: Record<string, string>, rows: Scope[], extra = {}) =>
    renderToStaticMarkup(
      <ScopesTable
        list={LIST}
        state={parseListQuery(LIST, params)}
        scopes={rows}
        page={{ next: "c2", previous: "c0" }}
        total={{ count: rows.length, capped: false }}
        {...extra}
      />,
    );

  it("lists scopes with @, description, creator and date, sortable, with the page links", () => {
    const html = table({ q: "plat" }, [
      scope(),
      scope({ id: "s2", name: "team", createdBy: null }),
    ]);
    for (const text of [
      "@platform",
      "Shared platform tools.",
      "root@example.com",
      "2026-09-20",
      "@team",
      "2 scopes",
      'href="/workspaces/global?q=plat&amp;cursor=c2"',
      'href="/workspaces/global?q=plat&amp;sort=created"',
      'aria-sort="ascending"',
    ])
      expect(html, text).toContain(text);
    expect(html).toMatch(/aria-label="Remove the search filter"[^>]*href="\/workspaces\/global"/);
    // One workspace's scopes: no Workspace column or filter (115).
    expect(html).not.toContain(">Workspace<");
    expect(html).not.toContain('name="workspace"');
    expect(html).not.toContain('<span class="sr-only">Actions</span>');
  });

  it("explains an empty list, with and without a search", () => {
    expect(table({}, [])).toContain("No scopes yet.");
    expect(table({ q: "x" }, [])).toContain("No scopes match this search.");
  });

  it("turns a view into the server query", () => {
    expect(scopesQueryOf(parseListQuery(LIST, { q: "plat", sort: "created" }))).toEqual({
      sort: "created",
      dir: "desc",
      size: 50,
      cursor: undefined,
      search: "plat",
    });
  });

  it("the create dialog makes the scope in the workspace whose page it's on (115)", () => {
    const html = renderToStaticMarkup(<CreateScopeDialog workspace={ACME} />);
    expect(html).toContain("Create scope");
    expect(html).toContain('<input type="hidden" name="workspaceId" value="w1"/>');
    expect(html).toContain("Its admins or root can move it later.");
    expect(html).not.toContain("<select");
  });
});

describe("Admin › Scopes, gone (115)", () => {
  it("sends its old address to the Workspaces pages: a workspace's filter to its page", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({
      source: "/admin/scopes",
      has: [{ type: "query", key: "workspace", value: "(?<workspace>[a-z0-9-]+)" }],
      destination: "/workspaces/:workspace",
      permanent: false,
    });
    expect(redirects).toContainEqual({
      source: "/admin/scopes",
      destination: "/workspaces",
      permanent: false,
    });
    // The one with the filter comes first, so it wins.
    const at = (has: boolean) =>
      redirects.findIndex((r) => r.source === "/admin/scopes" && (r.has !== undefined) === has);
    expect(at(true)).toBeLessThan(at(false));
  });
});
