import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { ScopeNameTakenError } from "@/server/domains/items/exceptions/errors";
import type { Scope } from "@/server/domains/items/models/scope";

const scopes = vi.hoisted(() => ({
  createScope: vi.fn(),
  updateScopeDescription: vi.fn(),
  listScopes: vi.fn(),
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
const { ScopesTable, scopesPageUrl } = await import("../scopes/ScopesTable");
const { parseScopesQuery } = await import("../scopes/query");
const { CreateScopeDialog } = await import("./ScopeDialogs");
const { default: AdminScopes } = await import("@/app/(app)/admin/scopes/page");
const { default: Scopes } = await import("@/app/(app)/scopes/page");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const scope = (overrides: Partial<Scope> = {}): Scope => ({
  id: "s1",
  name: "platform",
  description: "Shared platform tools.",
  createdBy: { id: "r", email: "root@example.com" },
  createdAt: new Date("2026-09-20T10:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  scopes.listScopes.mockResolvedValue({ scopes: [scope()], nextCursor: null });
});

describe("scope actions", () => {
  it("creates a scope and revalidates both pages", async () => {
    scopes.createScope.mockResolvedValue(scope());
    expect(
      await actions.createScopeFromForm({}, form({ name: "@Platform", description: "Tools." })),
    ).toEqual({ done: "Created @platform." });
    expect(scopes.createScope).toHaveBeenCalledWith(expect.any(Headers), {
      name: "@Platform",
      description: "Tools.",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/scopes");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/scopes");
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

describe("ScopesTable", () => {
  it("lists scopes with @, description, creator and date, and the page links", () => {
    const html = renderToStaticMarkup(
      <ScopesTable
        base="/scopes"
        scopes={[scope(), scope({ id: "s2", name: "team", createdBy: null })]}
        search="plat"
        nextCursor="team"
        paged
      />,
    );
    for (const text of [
      "@platform",
      "Shared platform tools.",
      "root@example.com",
      "2026-09-20",
      "@team",
    ])
      expect(html, text).toContain(text);
    expect(html).toContain('href="/scopes?q=plat&amp;cursor=team"');
    expect(html).toContain('href="/scopes?q=plat"');
    expect(html).not.toContain("Actions");
  });

  it("explains an empty list, with and without a search", () => {
    const empty = (search: string) =>
      renderToStaticMarkup(
        <ScopesTable base="/scopes" scopes={[]} search={search} nextCursor={null} paged={false} />,
      );
    expect(empty("")).toContain("Root creates the first one");
    expect(empty("x")).toContain("No scopes match this search.");
  });

  it("reads the query safely, and builds page URLs", () => {
    expect(parseScopesQuery({ q: "  plat ", cursor: "team" })).toEqual({
      search: "plat",
      cursor: "team",
    });
    expect(parseScopesQuery({ cursor: "../x" }).cursor).toBeUndefined();
    expect(scopesPageUrl("/admin/scopes", "", "team")).toBe("/admin/scopes?cursor=team");
  });

  it("the create dialog's button renders", () => {
    expect(renderToStaticMarkup(<CreateScopeDialog />)).toContain("Create scope");
  });
});

describe("the pages", () => {
  it("/admin/scopes is a 404 for anyone but root, without listing", async () => {
    for (const user of [null, { role: "user" }, { role: "moderator" }]) {
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(AdminScopes({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
    }
    expect(scopes.listScopes).not.toHaveBeenCalled();
  });

  it("root gets the list with edit buttons; /scopes is read-only for everyone", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    const admin = renderToStaticMarkup(await AdminScopes({ searchParams: Promise.resolve({}) }));
    expect(admin).toContain("Edit @platform");
    expect(admin).toContain("Create scope");
    const everyone = renderToStaticMarkup(
      await Scopes({ searchParams: Promise.resolve({ q: "plat" }) }),
    );
    expect(everyone).toContain("@platform");
    expect(everyone).not.toContain("Edit @platform");
    expect(scopes.listScopes).toHaveBeenLastCalledWith(expect.any(Headers), {
      search: "plat",
      cursor: undefined,
    });
  });
});
