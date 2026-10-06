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
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/items/actions/scopes", () => scopes);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const actions = await import("./actions");
const { ScopesTable } = await import("./ScopesTable");
const { parseListQuery } = await import("@/components/ui/data-table/list-query");
const { ADMIN_SCOPES_LIST, scopesQueryOf } = await import("./list");
const { CreateScopeDialog } = await import("./ScopeDialogs");
const { default: AdminScopes } = await import("@/app/(app)/admin/scopes/page");

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

beforeEach(() => {
  vi.clearAllMocks();
  scopes.pageScopes.mockResolvedValue({
    scopes: [scope()],
    next: null,
    previous: null,
    total: { count: 1, capped: false },
  });
});

describe("scope actions", () => {
  it("creates a scope and revalidates the admin page", async () => {
    scopes.createScope.mockResolvedValue(scope());
    expect(
      await actions.createScopeFromForm({}, form({ name: "@Platform", description: "Tools." })),
    ).toEqual({ done: "Created @platform." });
    expect(scopes.createScope).toHaveBeenCalledWith(expect.any(Headers), {
      name: "@Platform",
      description: "Tools.",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/scopes");
    expect(cache.revalidatePath).toHaveBeenCalledTimes(1);
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
        list={ADMIN_SCOPES_LIST}
        state={parseListQuery(ADMIN_SCOPES_LIST, params)}
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
      'href="/admin/scopes?q=plat&amp;cursor=c2"',
      'href="/admin/scopes?q=plat&amp;sort=created"',
      'aria-sort="ascending"',
    ])
      expect(html, text).toContain(text);
    expect(html).toMatch(/aria-label="Remove the search filter"[^>]*href="\/admin\/scopes"/);
    expect(html).not.toContain('<span class="sr-only">Actions</span>');
  });

  it("explains an empty list, with and without a search", () => {
    expect(table({}, [])).toContain("Root creates the first one");
    expect(table({ q: "x" }, [])).toContain("No scopes match this search.");
  });

  it("turns a view into the server query", () => {
    expect(
      scopesQueryOf(parseListQuery(ADMIN_SCOPES_LIST, { q: "plat", sort: "created" })),
    ).toEqual({
      sort: "created",
      dir: "desc",
      size: 50,
      cursor: undefined,
      search: "plat",
    });
  });

  it("the create dialog's button renders", () => {
    expect(renderToStaticMarkup(<CreateScopeDialog />)).toContain("Create scope");
  });
});

describe("the page", () => {
  it("/admin/scopes is a 404 for anyone but root, without listing", async () => {
    for (const user of [null, { role: "user" }, { role: "moderator" }]) {
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(AdminScopes({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
    }
    expect(scopes.pageScopes).not.toHaveBeenCalled();
  });

  it("root gets the list with edit buttons, searched and sorted on the server", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    const admin = renderToStaticMarkup(
      await AdminScopes({ searchParams: Promise.resolve({ q: "plat" }) }),
    );
    expect(admin).toContain("@platform");
    expect(admin).toContain("Edit @platform");
    expect(admin).toContain("Create scope");
    expect(scopes.pageScopes).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ search: "plat", sort: "name", dir: "asc", size: 50 }),
    );
  });
});
