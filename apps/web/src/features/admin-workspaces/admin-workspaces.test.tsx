import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import type { Scope } from "@/server/domains/items/models/scope";
import {
  WorkspaceNameTakenError,
  WorkspaceNotEmptyError,
} from "@/server/domains/workspaces/exceptions/errors";
import type { Workspace } from "@/server/domains/workspaces/models/workspace";

const workspaces = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  pageWorkspaces: vi.fn(),
  findWorkspace: vi.fn(),
}));
const scopes = vi.hoisted(() => ({ pageScopes: vi.fn() }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const navigation = vi.hoisted(() => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
  usePathname: () => "/admin/workspaces",
}));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("@/server/domains/items/actions/scopes", () => scopes);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("next/cache", () => cache);
vi.mock("next/navigation", () => navigation);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { WorkspacesTable } = await import("./WorkspacesTable");
const { parseListQuery } = await import("@/components/ui/data-table/list-query");
const { ADMIN_WORKSPACES_LIST, workspacesQueryOf } = await import("./list");
const { CreateWorkspaceDialog, DeleteWorkspaceButton } = await import("./WorkspaceDialogs");
const { AdminNav } = await import("@/features/admin/AdminNav");
const { default: AdminWorkspaces } = await import("@/app/(app)/admin/workspaces/page");
const { default: AdminWorkspace } = await import("@/app/(app)/admin/workspaces/[name]/page");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const workspace = (overrides: Partial<Workspace> = {}): Workspace => ({
  id: "w1",
  name: "acme",
  description: "Acme's teams.",
  visibility: "public",
  isGlobal: false,
  scopes: 0,
  createdBy: { id: "r", email: "root@example.com" },
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  ...overrides,
});
const global = workspace({
  id: "00000000000000000000000000",
  name: "global",
  description: "Everyone on this instance",
  isGlobal: true,
  scopes: 1,
  createdBy: null,
});
const scope = (overrides: Partial<Scope> = {}): Scope => ({
  id: "s1",
  name: "acme-infra",
  description: "Infrastructure.",
  workspace: { id: "w1", name: "acme" },
  createdBy: null,
  createdAt: new Date("2026-10-02T10:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  workspaces.pageWorkspaces.mockResolvedValue({
    workspaces: [global, workspace()],
    next: null,
    previous: null,
    total: { count: 2, capped: false },
  });
  scopes.pageScopes.mockResolvedValue({
    scopes: [scope()],
    next: null,
    previous: null,
    total: { count: 1, capped: false },
  });
});

describe("workspace actions", () => {
  it("creates a public workspace and revalidates the list", async () => {
    workspaces.createWorkspace.mockResolvedValue(workspace());
    expect(
      await actions.createWorkspaceFromForm(
        {},
        form({ name: "Acme", description: "Acme's teams.", visibility: "public" }),
      ),
    ).toEqual({ done: "Created acme." });
    expect(workspaces.createWorkspace).toHaveBeenCalledWith(expect.any(Headers), {
      name: "Acme",
      description: "Acme's teams.",
      visibility: "public",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/workspaces");
  });

  it("saves a description and revalidates the list and the workspace's page", async () => {
    expect(
      await actions.updateWorkspaceFromForm({}, form({ name: "acme", description: "New." })),
    ).toEqual({ done: "Description saved." });
    expect(workspaces.updateWorkspace).toHaveBeenCalledWith(expect.any(Headers), {
      name: "acme",
      description: "New.",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/workspaces");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/workspaces/acme");
  });

  it("deletes, then goes back to the list", async () => {
    await expect(actions.deleteWorkspaceFromForm({}, form({ name: "acme" }))).rejects.toThrow(
      "NEXT_REDIRECT /admin/workspaces",
    );
    expect(workspaces.deleteWorkspace).toHaveBeenCalledWith(expect.any(Headers), {
      name: "acme",
    });
  });

  it("shows domain and permission errors, stays put, and rethrows anything else", async () => {
    workspaces.createWorkspace.mockRejectedValueOnce(new WorkspaceNameTakenError("acme"));
    expect((await actions.createWorkspaceFromForm({}, form({}))).error).toContain(
      "That name is taken",
    );
    workspaces.deleteWorkspace.mockRejectedValueOnce(new WorkspaceNotEmptyError(2));
    expect(await actions.deleteWorkspaceFromForm({}, form({ name: "acme" }))).toEqual({
      error: "Move or remove its scopes first.",
    });
    expect(navigation.redirect).not.toHaveBeenCalled();
    workspaces.updateWorkspace.mockRejectedValueOnce(new ForbiddenError("workspaces.manage"));
    expect((await actions.updateWorkspaceFromForm({}, form({ name: "x" }))).error).toContain(
      "permission",
    );
    workspaces.createWorkspace.mockRejectedValueOnce(new Error("database down"));
    await expect(actions.createWorkspaceFromForm({}, form({}))).rejects.toThrow("database down");
  });
});

describe("WorkspacesTable", () => {
  const table = (params: Record<string, string>, rows: Workspace[]) =>
    renderToStaticMarkup(
      <WorkspacesTable
        list={ADMIN_WORKSPACES_LIST}
        state={parseListQuery(ADMIN_WORKSPACES_LIST, params)}
        workspaces={rows}
        page={{ next: "c2", previous: null }}
        total={{ count: rows.length, capped: false }}
      />,
    );

  it("lists name (a link to its page), description, visibility, scopes and date, sortable", () => {
    const html = table({ q: "a" }, [global, workspace({ scopes: 3 })]);
    for (const text of [
      'href="/admin/workspaces/global"',
      'href="/admin/workspaces/acme"',
      "Everyone on this instance",
      "Acme&#x27;s teams.",
      "Public",
      ">3<",
      "2026-10-01",
      "2 workspaces",
      'href="/admin/workspaces?q=a&amp;cursor=c2"',
      'href="/admin/workspaces?q=a&amp;sort=created"',
    ])
      expect(html, text).toContain(text);
    expect(html.indexOf("global")).toBeLessThan(html.indexOf("acme"));
  });

  it("explains an empty search", () => {
    expect(table({ q: "x" }, [])).toContain("No workspaces match this search.");
  });

  it("turns a view into the server query", () => {
    expect(
      workspacesQueryOf(parseListQuery(ADMIN_WORKSPACES_LIST, { q: "ac", sort: "created" })),
    ).toEqual({ sort: "created", dir: "desc", size: 50, cursor: undefined, search: "ac" });
  });
});

describe("the dialogs", () => {
  it("New workspace renders its button", () => {
    expect(renderToStaticMarkup(<CreateWorkspaceDialog />)).toContain("New workspace");
  });

  it("Delete is disabled, with the reason, while the workspace has scopes", () => {
    const busy = renderToStaticMarkup(<DeleteWorkspaceButton name="acme" scopes={2} />);
    expect(busy).toMatch(/\sdisabled=""/);
    expect(busy).toContain("Move or remove its scopes first.");
    const empty = renderToStaticMarkup(<DeleteWorkspaceButton name="acme" scopes={0} />);
    expect(empty).not.toMatch(/\sdisabled=""/);
  });
});

describe("the admin nav", () => {
  it("has Workspaces, before Scopes", () => {
    const html = renderToStaticMarkup(<AdminNav />);
    expect(html).toContain('href="/admin/workspaces"');
    expect(html.indexOf("/admin/workspaces")).toBeLessThan(html.indexOf("/admin/scopes"));
    expect(html).toMatch(
      /aria-current="page"[^>]*>Workspaces|href="\/admin\/workspaces"[^>]*aria-current="page"/,
    );
  });
});

describe("the pages", () => {
  const listPage = (params: Record<string, string> = {}) =>
    AdminWorkspaces({ searchParams: Promise.resolve(params) });
  const workspacePage = (name: string, params: Record<string, string> = {}) =>
    AdminWorkspace({
      params: Promise.resolve({ name }),
      searchParams: Promise.resolve(params),
    });

  it("are a 404 for anyone but root, without reading anything", async () => {
    for (const user of [null, { role: "user" }, { role: "moderator" }]) {
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(listPage()).rejects.toThrow("NEXT_NOT_FOUND");
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(workspacePage("acme")).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(workspaces.pageWorkspaces).not.toHaveBeenCalled();
    expect(workspaces.findWorkspace).not.toHaveBeenCalled();
  });

  it("root gets the list, searched and sorted on the server, with New workspace", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    const html = renderToStaticMarkup(await listPage({ q: "ac" }));
    expect(html).toContain("New workspace");
    expect(html).toContain('href="/admin/workspaces/acme"');
    expect(html).toContain("What is a workspace?");
    expect(html).toContain('href="https://www.ronne.ai/marketplace/docs/workspaces#what"');
    expect(workspaces.pageWorkspaces).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ search: "ac", sort: "name" }),
    );
  });

  it("a workspace's page shows its description and scopes, with edit and delete", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    const html = renderToStaticMarkup(await workspacePage("acme", { q: "infra" }));
    for (const text of [
      "All workspaces",
      "Acme&#x27;s teams.",
      "Public",
      "@acme-infra",
      "Edit description",
      "Move or remove its scopes first.",
      // The scope table pages on this page's own address.
      'href="/admin/workspaces/acme?q=infra&amp;sort=created"',
    ])
      expect(html, text).toContain(text);
    expect(workspaces.findWorkspace).toHaveBeenCalledWith(expect.any(Headers), "acme");
    expect(scopes.pageScopes).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ workspaceId: "w1", search: "infra" }),
    );
  });

  it("global's page has no edit or delete", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(global);
    const html = renderToStaticMarkup(await workspacePage("global"));
    expect(html).toContain("It can&#x27;t be changed or deleted.");
    expect(html).not.toContain("Edit description");
    expect(html).not.toContain("Delete");
  });

  it("an unknown or malformed name is a 404", async () => {
    session.getCurrentUser.mockResolvedValue({ role: "root" });
    workspaces.findWorkspace.mockResolvedValue(null);
    await expect(workspacePage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(workspacePage("%")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(workspaces.findWorkspace).toHaveBeenLastCalledWith(expect.any(Headers), "%");
    expect(scopes.pageScopes).not.toHaveBeenCalled();
  });
});
