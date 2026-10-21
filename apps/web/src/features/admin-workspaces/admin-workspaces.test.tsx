import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import type { Scope } from "@/server/domains/items/models/scope";
import {
  ScopeMoveOpenError,
  ScopeMoveRefusedError,
  WorkspaceHasOutsideDependentsError,
  WorkspaceNameTakenError,
  WorkspaceNotEmptyError,
} from "@/server/domains/workspaces/exceptions/errors";
import type { Workspace } from "@/server/domains/workspaces/models/workspace";
import { inLocaleAsync } from "@/test/intl";

const workspaces = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  pageWorkspaces: vi.fn(),
  findWorkspace: vi.fn(),
  viewWorkspace: vi.fn(),
  setWorkspaceVisibility: vi.fn(),
  visibilityImpact: vi.fn(),
  renameWorkspace: vi.fn(),
  renameImpact: vi.fn(),
  askScopeMove: vi.fn(),
  cancelScopeMove: vi.fn(),
  moveImpact: vi.fn(),
  moveTargets: vi.fn(),
  scopeMovesIn: vi.fn(async () => ({})),
  pendingRequests: vi.fn(async () => ({ requests: [], total: 0 })),
  movesToAnswer: vi.fn(async () => ({ moves: [], total: 0 })),
  ownRequests: vi.fn(async (): Promise<unknown[]> => []),
  myWorkspaces: vi.fn(async (): Promise<unknown[]> => []),
  pageMembers: vi.fn(async () => ({
    rows: [],
    next: null,
    previous: null,
    total: { count: 0, capped: false },
  })),
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
  usePathname: () => "/workspaces",
  useRouter: () => ({ refresh: () => {} }),
}));
const shelves = vi.hoisted(() => ({
  loadPinnedShelf: vi.fn(async () => ({ entries: [] as unknown[], starred: [] as string[] })),
}));
vi.mock("@/features/pins/load-shelves", () => shelves);
vi.mock("@/features/favorites/actions", () => ({ toggleFavoriteFromForm: vi.fn() }));
vi.mock("@/features/pins/actions", () => ({
  loadShelfAction: vi.fn(),
  moveInShelfAction: vi.fn(),
  pinToShelfAction: vi.fn(),
  unpinFromShelfAction: vi.fn(),
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
const {
  CreateWorkspaceDialog,
  CreateWorkspaceForm,
  DeleteWorkspaceButton,
  RenameForm,
  VisibilityForm,
} = await import("./WorkspaceDialogs");
const { default: AdminWorkspaces } = await import("@/app/(app)/workspaces/page");
const { default: AdminWorkspace } = await import("@/app/(app)/workspaces/[name]/page");
const { default: nextConfig } = await import("../../../next.config");

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
  ownerId: null,
  scopes: 0,
  moderators: 0,
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
    kinds: { shared: { count: 2, capped: false }, personal: { count: 51, capped: false } },
  });
  scopes.pageScopes.mockResolvedValue({
    scopes: [scope()],
    next: null,
    previous: null,
    total: { count: 1, capped: false },
  });
});

describe("workspace actions", () => {
  it("makes a workspace private or public, says so, and refreshes every page (093)", async () => {
    workspaces.setWorkspaceVisibility.mockResolvedValue(undefined);
    expect(
      await actions.setVisibilityFromForm({}, form({ name: "acme", visibility: "private" })),
    ).toEqual({ done: "It's private: only its members and root see its items." });
    expect(workspaces.setWorkspaceVisibility).toHaveBeenCalledWith(expect.any(Headers), {
      name: "acme",
      visibility: "private",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(
      await actions.setVisibilityFromForm({}, form({ name: "acme", visibility: "public" })),
    ).toEqual({ done: "It's public: everyone signed in sees its items." });
    workspaces.setWorkspaceVisibility.mockRejectedValueOnce(
      new WorkspaceHasOutsideDependentsError("acme", ["@team/front"]),
    );
    expect(
      (await actions.setVisibilityFromForm({}, form({ name: "acme", visibility: "private" })))
        .error,
    ).toContain("@team/front");
  });

  it("reads what Make private would meet, or why it can't (093)", async () => {
    workspaces.visibilityImpact.mockResolvedValueOnce({
      dependents: ["@team/front"],
      openDependents: [],
    });
    expect(await actions.visibilityImpactFor("acme")).toEqual({
      dependents: ["@team/front"],
      openDependents: [],
    });
    workspaces.visibilityImpact.mockRejectedValueOnce(new ForbiddenError("workspaces.manage"));
    expect("error" in (await actions.visibilityImpactFor("acme"))).toBe(true);
  });

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
    expect(cache.revalidatePath).toHaveBeenCalledWith("/workspaces");
  });

  it("saves a description and revalidates the list and the workspace's page", async () => {
    expect(
      await actions.updateWorkspaceFromForm({}, form({ name: "acme", description: "New." })),
    ).toEqual({ done: "Description saved." });
    expect(workspaces.updateWorkspace).toHaveBeenCalledWith(expect.any(Headers), {
      name: "acme",
      description: "New.",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/workspaces");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/workspaces/acme");
  });

  it("renames, refreshes every page and goes to the new address (113)", async () => {
    workspaces.renameWorkspace.mockResolvedValueOnce(workspace({ name: "acme-platform" }));
    await expect(
      actions.renameWorkspaceFromForm({}, form({ name: "acme", to: "ACME-Platform " })),
    ).rejects.toThrow("NEXT_REDIRECT /workspaces/acme-platform");
    expect(workspaces.renameWorkspace).toHaveBeenCalledWith(expect.any(Headers), {
      name: "acme",
      to: "ACME-Platform ",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
    // Refused: it says why and stays put.
    workspaces.renameWorkspace.mockRejectedValueOnce(new WorkspaceNameTakenError("other"));
    expect(
      (await actions.renameWorkspaceFromForm({}, form({ name: "acme", to: "other" }))).error,
    ).toContain("That name is taken");
    expect(navigation.redirect).toHaveBeenCalledTimes(1);
  });

  it("reads how many items a rename would change, or why it can't (113)", async () => {
    workspaces.renameImpact.mockResolvedValueOnce({ items: 12 });
    expect(await actions.renameImpactFor("acme")).toEqual({ items: 12 });
    workspaces.renameImpact.mockRejectedValueOnce(new ForbiddenError("workspace.rename"));
    expect(await actions.renameImpactFor("acme")).toEqual({
      error: expect.stringContaining("permission"),
    });
  });

  it("moves a scope or asks to, passing the typed name only when asked for it (115)", async () => {
    workspaces.askScopeMove.mockResolvedValueOnce({ outcome: "moved" } as never);
    expect(
      await actions.askMoveFromForm(
        {},
        form({ scopeId: "s1", workspace: "beta", to: "acme", name: "infra", message: "" }),
      ),
    ).toEqual({ done: "moved" });
    expect(workspaces.askScopeMove).toHaveBeenLastCalledWith(expect.any(Headers), {
      scopeId: "s1",
      to: "acme",
      name: "infra",
      message: "",
      confirm: undefined,
    });
    // The dialog refreshes the page when it closes: the action doesn't, or the page would redraw
    // under it.
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    workspaces.askScopeMove.mockResolvedValueOnce({ outcome: "requested" } as never);
    const asked = await actions.askMoveFromForm(
      {},
      form({ scopeId: "s1", workspace: "beta", to: "acme", name: "infra", confirm: "infra" }),
    );
    expect(asked).toEqual({ done: "requested" });
    expect(workspaces.askScopeMove).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ confirm: "infra" }),
    );
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    // Refused: the checks' result, for the dialog to list; any other refusal as its message.
    const impact = { refused: true, outsideDependents: ["@acme/team/app"] };
    workspaces.askScopeMove.mockRejectedValueOnce(new ScopeMoveRefusedError(impact as never));
    expect(await actions.askMoveFromForm({}, form({ scopeId: "s1", to: "vault" }))).toEqual({
      refused: impact,
    });
    workspaces.askScopeMove.mockRejectedValueOnce(new ScopeMoveOpenError("acme"));
    expect(await actions.askMoveFromForm({}, form({ scopeId: "s1", to: "vault" }))).toEqual({
      error: "A move to acme is waiting for an answer.",
    });
  });

  it("cancels a move, and reads targets and impact or why it can't (115)", async () => {
    expect(await actions.cancelMoveFromForm({}, form({ moveId: "m1", workspace: "beta" }))).toEqual(
      { done: "Cancelled." },
    );
    expect(workspaces.cancelScopeMove).toHaveBeenCalledWith(expect.any(Headers), {
      moveId: "m1",
    });
    workspaces.moveTargets.mockResolvedValueOnce([{ name: "acme" }] as never);
    expect(await actions.moveTargetsFor("s1")).toEqual({ targets: [{ name: "acme" }] });
    workspaces.moveTargets.mockRejectedValueOnce(new ForbiddenError("scopes.move"));
    expect(await actions.moveTargetsFor("s1")).toEqual({
      error: expect.stringContaining("permission"),
    });
    workspaces.moveImpact.mockResolvedValueOnce({ way: "once" } as never);
    expect(await actions.moveImpactFor({ scopeId: "s1", to: "acme" })).toEqual({ way: "once" });
    workspaces.moveImpact.mockRejectedValueOnce(new ScopeMoveOpenError("acme"));
    expect(await actions.moveImpactFor({ scopeId: "s1", to: "acme" })).toEqual({
      error: "A move to acme is waiting for an answer.",
    });
  });

  it("deletes, then goes back to the list", async () => {
    await expect(actions.deleteWorkspaceFromForm({}, form({ name: "acme" }))).rejects.toThrow(
      "NEXT_REDIRECT /workspaces",
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
      'href="/workspaces/global"',
      'href="/workspaces/acme"',
      "Everyone on this instance",
      "Acme&#x27;s teams.",
      "Public",
      ">3<",
      "2026-10-01",
      "2 workspaces",
      'href="/workspaces?q=a&amp;cursor=c2"',
      'href="/workspaces?q=a&amp;sort=created"',
    ])
      expect(html, text).toContain(text);
    expect(html.indexOf("global")).toBeLessThan(html.indexOf("acme"));
  });

  it("counts each workspace's moderators, and says when it has none (091)", () => {
    const html = table({}, [workspace({ moderators: 2 }), workspace({ name: "beta", id: "w2" })]);
    expect(html).toContain(">Moderators<");
    expect(html).toContain(">2<");
    expect(html).toContain('<span class="text-muted">None</span>');
    expect(html).not.toContain("No moderators");
  });

  it("lists personal workspaces with their owners, under root's Kind filter (114)", () => {
    const html = renderToStaticMarkup(
      <WorkspacesTable
        list={ADMIN_WORKSPACES_LIST}
        state={parseListQuery(ADMIN_WORKSPACES_LIST, { kind: "personal" })}
        workspaces={[
          workspace({
            name: "ana",
            ownerId: "u1",
            ownerEmail: "ana@example.com",
            visibility: "private",
          }),
        ]}
        page={{ next: null, previous: null }}
        total={{ count: 1, capped: false }}
        kinds={{ shared: { count: 3, capped: false }, personal: { count: 1, capped: false } }}
      />,
    );
    for (const text of [">Owner<", "ana@example.com", 'aria-label="Kind"'])
      expect(html, text).toContain(text);
    // Shared and Personal as tabs (115), with their counts, the one shown marked; each keeps the
    // search and starts at the first page.
    expect(html).toContain('href="/workspaces">Shared (3)</a>');
    expect(html).toMatch(
      /aria-current="page"[^>]*href="\/workspaces\?kind=personal">Personal \(1\)/,
    );
    expect(html).not.toContain("Kind:");
    // Switching keeps the search and sort and starts at page one; a capped count says "+".
    const searched = renderToStaticMarkup(
      <WorkspacesTable
        list={ADMIN_WORKSPACES_LIST}
        state={{
          ...parseListQuery(ADMIN_WORKSPACES_LIST, {}),
          sort: "created",
          dir: "desc",
          cursor: "c9",
          filters: { q: "an", kind: "personal" },
        }}
        workspaces={[]}
        page={{ next: null, previous: "c8" }}
        total={{ count: 1000, capped: true }}
        kinds={{ shared: { count: 2, capped: false }, personal: { count: 1000, capped: true } }}
      />,
    );
    expect(searched).toContain('href="/workspaces?q=an&amp;sort=created">Shared (2)</a>');
    expect(searched).toContain(
      'href="/workspaces?q=an&amp;kind=personal&amp;sort=created">Personal (1000+)</a>',
    );
    expect(searched).not.toMatch(/href="[^"]*cursor=c9[^"]*">(Shared|Personal)/);
    expect(html).not.toContain(">Moderators<");
    expect(html).not.toContain(">Visibility<");
    // Without the filter (a workspace admin's list), no Kind.
    expect(table({}, [workspace()])).not.toContain('aria-label="Kind"');
  });

  it("explains an empty search", () => {
    expect(table({ q: "x" }, [])).toContain("No workspaces match this search.");
  });

  it("turns a view into the server query", () => {
    expect(
      workspacesQueryOf(parseListQuery(ADMIN_WORKSPACES_LIST, { q: "ac", sort: "created" })),
    ).toEqual({
      sort: "created",
      dir: "desc",
      size: 50,
      cursor: undefined,
      search: "ac",
      kind: "shared",
    });
    // Personal workspaces (114), and anything else as shared ones.
    for (const [kind, expected] of [
      ["personal", "personal"],
      ["other", "shared"],
    ] as const)
      expect(workspacesQueryOf(parseListQuery(ADMIN_WORKSPACES_LIST, { kind })).kind, kind).toBe(
        expected,
      );
  });
});

describe("the dialogs", () => {
  it("New workspace renders its button", () => {
    expect(renderToStaticMarkup(<CreateWorkspaceDialog />)).toContain("New workspace");
  });

  it("Make public asks first; Make private checks what depends on it before it can go (093)", () => {
    const toPublic = renderToStaticMarkup(
      <VisibilityForm name="acme" to="public" onDone={() => {}} />,
    );
    expect(toPublic).toContain("Everyone on this instance will see");
    expect(toPublic).toContain(">Make public<");
    const toPrivate = renderToStaticMarkup(
      <VisibilityForm name="acme" to="private" onDone={() => {}} />,
    );
    expect(toPrivate).toContain("Checking what depends on its items");
    expect(toPrivate).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Make private/);
  });

  it("Make private lists the outside items that depend on it, and can't go while there are any (093)", () => {
    const blocked = renderToStaticMarkup(
      <VisibilityForm
        name="acme"
        to="private"
        onDone={() => {}}
        loaded={{ dependents: ["@team/a", "@team/b", "@team/c"], openDependents: ["@team/d"] }}
      />,
    );
    expect(blocked).toContain("3 items outside acme depend on its items");
    expect(blocked).toContain("Public or private?");
    for (const item of ["@team/a", "@team/b", "@team/c"]) expect(blocked).toContain(`>${item}<`);
    expect(blocked).toContain("1 open submission outside acme depends on its items");
    expect(blocked).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Make private/);
    const clear = renderToStaticMarkup(
      <VisibilityForm
        name="acme"
        to="private"
        onDone={() => {}}
        loaded={{ dependents: [], openDependents: ["@team/d"] }}
      />,
    );
    expect(clear).toContain("fail at release");
    expect(clear).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Make private/);
  });

  it("New workspace asks public or private, public chosen (093)", () => {
    const html = renderToStaticMarkup(<CreateWorkspaceForm onDone={() => {}} />);
    const radio = (value: string) =>
      html.match(new RegExp(`<input[^>]*name="visibility"[^>]*value="${value}"[^>]*>`))?.[0] ?? "";
    expect(radio("public")).toContain('checked=""');
    expect(radio("private")).toContain('type="radio"');
    expect(radio("private")).not.toContain("checked");
    expect(html).toContain("Only its members and root see its items");
    expect(html).toContain("Public or private?");
    expect(html).toContain("/marketplace/docs/workspaces#visibility");
  });

  it("Rename shows the name, what changes for its items and links, and waits for a new name (113)", () => {
    const html = renderToStaticMarkup(
      <RenameForm name="acme" onDone={() => {}} loaded={{ items: 12 }} />,
    );
    for (const text of [
      'value="acme"',
      "Its 12 items will be renamed from",
      "@acme/…",
      "Their old names keep working for installs, lockfiles and dependencies",
      "Links to this workspace (its page and its join link) will stop working",
      "rmk feed build --workspace",
      "What changes when I rename?",
      "/marketplace/docs/workspaces#managing",
      "Type the new name.",
    ])
      expect(html, text).toContain(text);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Rename/s);
    expect(
      renderToStaticMarkup(<RenameForm name="acme" onDone={() => {}} loaded={{ items: 1 }} />),
    ).toContain("Its 1 item will be renamed");
    expect(
      renderToStaticMarkup(
        <RenameForm name="acme" onDone={() => {}} loaded={{ error: "Couldn't count." }} />,
      ),
    ).toContain("Couldn&#x27;t count.");
  });

  it("Delete is disabled, with the reason, while the workspace has scopes", () => {
    const busy = renderToStaticMarkup(<DeleteWorkspaceButton name="acme" scopes={2} />);
    expect(busy).toMatch(/\sdisabled=""/);
    expect(busy).toContain("Move or remove its scopes first.");
    const empty = renderToStaticMarkup(<DeleteWorkspaceButton name="acme" scopes={0} />);
    expect(empty).not.toMatch(/\sdisabled=""/);
  });
});

const page = (rows: unknown[]) =>
  ({ rows, next: null, previous: null, total: { count: rows.length, capped: false } }) as never;

describe("the pages", () => {
  const listPage = (params: Record<string, string> = {}) =>
    AdminWorkspaces({ searchParams: Promise.resolve(params) });
  const workspacePage = (name: string, params: Record<string, string> = {}) =>
    AdminWorkspace({
      params: Promise.resolve({ name }),
      searchParams: Promise.resolve(params),
    });

  it("sends Admin › Workspaces' old addresses under Workspaces, before the admin layout (115)", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual({
      source: "/admin/workspaces",
      destination: "/workspaces",
      permanent: false,
    });
    expect(redirects).toContainEqual({
      source: "/admin/workspaces/:name",
      destination: "/workspaces/:name",
      permanent: false,
    });
  });

  it("lists every workspace for root only; a workspace's page for anyone who sees it (115)", async () => {
    for (const user of [
      { role: "user", workspaces: {} },
      { role: "user", workspaces: { global: "moderator" } },
      { role: "user", workspaces: { w1: "admin" } },
      { role: "user", workspaces: { mine: "admin" }, personal: "mine" },
    ]) {
      session.getCurrentUser.mockResolvedValueOnce(user);
      const html = renderToStaticMarkup(await listPage());
      expect(html).not.toContain("New workspace");
      expect(html).not.toContain('aria-label="Kind"');
    }
    expect(workspaces.pageWorkspaces).not.toHaveBeenCalled();
    expect(workspaces.myWorkspaces).toHaveBeenCalledTimes(4);
    // Signed out, or a workspace they don't see: as a name no workspace has.
    session.getCurrentUser.mockResolvedValueOnce(null);
    await expect(workspacePage("acme")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(workspaces.viewWorkspace).not.toHaveBeenCalled();
    session.getCurrentUser.mockResolvedValueOnce({ id: "u", role: "user", workspaces: {} });
    workspaces.viewWorkspace.mockResolvedValueOnce(null);
    await expect(workspacePage("acme")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows a plain member the scopes and their role, and nothing to manage (115)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({
      id: "u",
      role: "user",
      workspaces: { w1: "user" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    const html = renderToStaticMarkup(await workspacePage("acme", { tab: "members" }));
    expect(html).toContain("@acme-infra");
    expect(html).toContain(">User<");
    for (const text of [
      ">Members<",
      ">Requests<",
      "Edit description",
      ">Rename<",
      "Make private",
      "Delete",
      "Create scope",
      'aria-label="Move @acme-infra"',
      'aria-label="Edit @acme/acme-infra"',
    ])
      expect(html, text).not.toContain(text);
    expect(workspaces.pageMembers).not.toHaveBeenCalled();
    // A moderator also answers requests to join: the Requests tab.
    session.getCurrentUser.mockResolvedValueOnce({
      id: "m",
      role: "user",
      workspaces: { w1: "moderator" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    const moderator = renderToStaticMarkup(await workspacePage("acme"));
    expect(moderator).toContain(">Requests<");
    expect(moderator).toContain(">Moderator<");
    for (const text of [
      ">Members<",
      "Create scope",
      "Edit description",
      'aria-label="Move @acme-infra"',
      'aria-label="Edit @acme/acme-infra"',
    ])
      expect(moderator, text).not.toContain(text);
  });

  it("shows the Scopes tab, loading no requests, to a member asking for Requests (115)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({
      id: "u",
      role: "user",
      workspaces: { w1: "user" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    const html = renderToStaticMarkup(await workspacePage("acme", { tab: "requests" }));
    expect(html).toMatch(/aria-current="page"[^>]*>Scopes</);
    expect(html).not.toContain(">Requests<");
    expect(workspaces.pendingRequests).not.toHaveBeenCalled();
    expect(workspaces.movesToAnswer).not.toHaveBeenCalled();
    expect(scopes.pageScopes).toHaveBeenCalled();
  });

  it("offers someone not in it Ask to join, or their request's state (115)", async () => {
    const outsider = { id: "o", role: "user", workspaces: {} };
    session.getCurrentUser.mockResolvedValueOnce(outsider);
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    workspaces.ownRequests.mockResolvedValueOnce([]);
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain("Ask to join");
    session.getCurrentUser.mockResolvedValueOnce(outsider);
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    workspaces.ownRequests.mockResolvedValueOnce([
      {
        id: "r1",
        workspace: "acme",
        status: "open",
        createdAt: new Date("2026-10-10T10:00:00Z"),
        decidedAt: null,
        reason: null,
        askAgainFrom: null,
      },
    ]);
    const requested = renderToStaticMarkup(await workspacePage("acme"));
    expect(requested).toContain("Requested");
    expect(requested).not.toContain("Ask to join");
  });

  it("root gets the list, searched and sorted on the server, with New workspace", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    const html = renderToStaticMarkup(await listPage({ q: "ac" }));
    expect(html).toContain("New workspace");
    expect(html).toContain('aria-label="Kind"');
    expect(html).toContain("Personal (51)");
    expect(html).toContain('href="/workspaces/acme"');
    expect(html).toContain("What is a workspace?");
    expect(html).toContain('href="https://www.ronne.ai/en/marketplace/docs/workspaces#what"');
    expect(workspaces.pageWorkspaces).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ search: "ac", sort: "name" }),
    );
  });

  it("passes root's Kind to the server (114)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    await listPage({ kind: "personal" });
    expect(workspaces.pageWorkspaces).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ kind: "personal" }),
    );
  });

  it("a personal workspace's page has its scopes, Rename and Edit description, nothing more (114)", async () => {
    const owner = { id: "u1", role: "user", workspaces: { w1: "admin" }, personal: "w1" };
    const mine = workspace({ name: "ana", ownerId: "u1", visibility: "private" });
    for (const params of [{}, { tab: "members" }, { tab: "requests" }] as Record<
      string,
      string
    >[]) {
      session.getCurrentUser.mockResolvedValueOnce(owner);
      workspaces.viewWorkspace.mockResolvedValueOnce(mine);
      const html = renderToStaticMarkup(await workspacePage("ana", params));
      for (const text of [
        ">Rename<",
        "Edit description",
        "Personal",
        "Yours alone",
        'href="/workspaces"',
      ])
        expect(html, text).toContain(text);
      for (const text of [">Members<", ">Requests<", "Make public", "Delete"])
        expect(html, text).not.toContain(text);
    }
    expect(workspaces.pageMembers).not.toHaveBeenCalled();
    // Root sees it as its owner's, with the same tabs and no visibility or Delete.
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(mine);
    const asRoot = renderToStaticMarkup(await workspacePage("ana"));
    expect(asRoot).toContain("Its owner’s alone");
    expect(asRoot).toContain("All workspaces");
    expect(asRoot).not.toContain("Make public");
    expect(asRoot).not.toContain(">Members<");
  });

  it("offers Move… on each scope to root and the workspace's admins, and shows a scope's move (115)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(
      'aria-label="Move @acme-infra"',
    );
    // Its admin, and a personal workspace's owner (who's its admin, 114).
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(
      'aria-label="Move @acme-infra"',
    );
    // An open move: Moving to … with Cancel instead of Move….
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    workspaces.scopeMovesIn.mockResolvedValueOnce({
      [scope().id]: { id: "m1", toWorkspace: "beta", status: "open", reason: null },
    } as never);
    const moving = renderToStaticMarkup(await workspacePage("acme"));
    expect(moving).toContain("Moving to beta");
    expect(moving).not.toContain('aria-label="Move @acme-infra"');
    expect(workspaces.scopeMovesIn).toHaveBeenLastCalledWith(expect.any(Headers), {
      workspaceId: "w1",
    });
  });

  it("shows the moves into the workspace on its Requests tab (115)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    workspaces.movesToAnswer.mockResolvedValueOnce({
      moves: [
        {
          id: "m1",
          scope: "@beta/infra",
          newName: "@acme/infra",
          renamed: false,
          from: "beta",
          to: "acme",
          items: 1,
          askedBy: { email: "dave@example.com", name: "Dave" },
          createdAt: new Date("2026-10-10T10:00:00Z"),
          message: null,
          notReviewed: [],
          impact: {
            outsideDependents: [],
            outsideHidden: 0,
            ownDependencies: [],
            ownHidden: 0,
            aliasTaken: [],
            aliasHidden: 0,
            clash: false,
          },
        },
      ],
      total: 1,
    } as never);
    const html = renderToStaticMarkup(await workspacePage("acme", { tab: "requests" }));
    expect(html).toContain("Scope moves");
    expect(html).toContain('aria-label="Approve moving @beta/infra to acme"');
    expect(workspaces.movesToAnswer).toHaveBeenLastCalledWith(expect.any(Headers), {
      workspaceId: "w1",
    });
    // None waiting: no section.
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme", { tab: "requests" }))).not.toContain(
      "Scope moves",
    );
  });

  it("a workspace's page shows its description and scopes, with edit and delete", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    const html = renderToStaticMarkup(await workspacePage("acme", { q: "infra" }));
    for (const text of [
      "All workspaces",
      "Acme&#x27;s teams.",
      "Public",
      "@acme-infra",
      "Edit description",
      "Move or remove its scopes first.",
      // The scope table pages on this page's own address.
      'href="/workspaces/acme?q=infra&amp;sort=created"',
    ])
      expect(html, text).toContain(text);
    expect(workspaces.viewWorkspace).toHaveBeenCalledWith(expect.any(Headers), "acme");
    expect(scopes.pageScopes).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ workspaceId: "w1", search: "infra" }),
    );
  });

  it("root and the workspace's admin can rename it; an admin of global can't rename global (113)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Rename<");
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Rename<");
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { [global.id]: "admin" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(global);
    expect(renderToStaticMarkup(await workspacePage("global"))).not.toContain(">Rename<");
  });

  it("the page reads in Portuguese and French: tabs, role, visibility and the notes (130)", async () => {
    const admin = {
      id: "a",
      role: "user",
      workspaces: { [workspace().id]: "admin" },
    };
    const render = async (locale: "pt" | "fr", params: Record<string, string> = {}) => {
      session.getCurrentUser.mockResolvedValueOnce(admin);
      workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
      return inLocaleAsync(locale, async () =>
        renderToStaticMarkup(await workspacePage("acme", params)),
      );
    };
    const pt = await render("pt");
    for (const text of [
      "Todos os espaços de trabalho",
      ">Escopos<",
      ">Membros<",
      ">Solicitações<",
      ">Admin<",
      'aria-label="Espaço de trabalho"',
    ])
      expect(pt, text).toContain(text);
    const fr = await render("fr");
    for (const text of [
      "Tous les espaces de travail",
      ">Portées<",
      ">Membres<",
      ">Demandes<",
      ">Admin<",
    ])
      expect(fr, text).toContain(text);
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(global);
    const globalPt = await inLocaleAsync("pt", async () =>
      renderToStaticMarkup(await workspacePage("global")),
    );
    expect(globalPt).toContain("Ele não pode ser alterado nem excluído.");
    expect(globalPt).toContain(">Root<");
    const mine = workspace({ ownerId: "me", name: "ana" });
    session.getCurrentUser.mockResolvedValueOnce({ id: "me", role: "user", workspaces: {} });
    workspaces.viewWorkspace.mockResolvedValueOnce(mine);
    const personal = await inLocaleAsync("fr", async () =>
      renderToStaticMarkup(await workspacePage("ana")),
    );
    expect(personal).toContain("Le vôtre seul, toujours privé.");
    expect(personal).toContain(">Personnel<");
  });

  it("global's page has no edit or delete", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(global);
    const html = renderToStaticMarkup(await workspacePage("global"));
    expect(html).toContain("It can’t be changed or deleted.");
    expect(html).not.toContain(">Rename<");
    expect(html).not.toContain("Edit description");
    expect(html).not.toContain("Delete");
  });

  it("a workspace's admin gets the workspaces they see, each name opening its page (115)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "user", workspaces: { w1: "admin" } });
    workspaces.myWorkspaces.mockResolvedValueOnce([
      {
        name: "acme",
        description: "Acme's teams.",
        visibility: "public",
        isGlobal: false,
        personal: false,
        role: "admin",
      },
    ]);
    const html = renderToStaticMarkup(await listPage());
    expect(html).not.toContain("New workspace");
    expect(html).toContain('href="/workspaces/acme"');
    expect(html).toContain(">Admin<");
  });

  it("an admin's workspace page has Members, Edit description and Create scope, not Delete (092)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    workspaces.pageMembers.mockResolvedValueOnce(
      page([
        {
          userId: "a",
          email: "a@example.com",
          name: "Ada",
          role: "admin",
          disabled: false,
          addedAt: new Date("2026-10-02T10:00:00Z"),
        },
        {
          userId: "m",
          email: "m@example.com",
          name: "Mo",
          role: "moderator",
          disabled: false,
          addedAt: new Date("2026-10-03T10:00:00Z"),
        },
      ]),
    );
    const html = renderToStaticMarkup(await workspacePage("acme", { tab: "members", q: "o" }));
    for (const text of [
      "Members",
      "Add members",
      "Ada",
      "(you)",
      'aria-label="Role of m@example.com"',
      'aria-label="Remove m@example.com"',
      "Edit description",
      // The members tab, on the page's own address, searched and filterable by role.
      'href="/workspaces/acme?tab=members&amp;q=o&amp;sort=added"',
      '<option value="admin">admin</option>',
    ])
      expect(html, text).toContain(text);
    expect(html).toMatch(/aria-current="page"[^>]*>Members</);
    // Their own row is read-only; delete is root's.
    expect(html).not.toContain('aria-label="Role of a@example.com"');
    expect(html).not.toContain('aria-label="Remove a@example.com"');
    expect(html).not.toContain(">Delete<");
    expect(workspaces.pageMembers).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ workspaceId: "w1", search: "o", sort: "name" }),
    );
    expect(scopes.pageScopes).not.toHaveBeenCalled();
  });

  it("an admin's Scopes tab, the default, has Create scope in this workspace (092)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    const html = renderToStaticMarkup(await workspacePage("acme"));
    expect(html).toMatch(/aria-current="page"[^>]*>Scopes</);
    expect(html).toContain("Create scope");
    expect(html).toContain('href="/workspaces/acme?tab=members"');
    expect(workspaces.pageMembers).not.toHaveBeenCalled();
  });

  it("an admin of another workspace gets a 404 here: they can't find it (092)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "user", workspaces: { w2: "admin" } });
    workspaces.viewWorkspace.mockResolvedValueOnce(null);
    await expect(workspacePage("acme")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(workspaces.pageMembers).not.toHaveBeenCalled();
  });

  it("global's page has members' roles but no Remove (092)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(global);
    workspaces.pageMembers.mockResolvedValueOnce(
      page([
        {
          userId: "u",
          email: "u@example.com",
          name: "Uma",
          role: "user",
          disabled: false,
          addedAt: new Date("2026-10-02T10:00:00Z"),
        },
      ]),
    );
    const html = renderToStaticMarkup(await workspacePage("global", { tab: "members" }));
    expect(html).toContain('aria-label="Role of u@example.com"');
    expect(html).not.toContain('aria-label="Remove u@example.com"');
  });

  it("root can make a workspace private or public; its admin can't, nor anyone on global (093)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Make private<");
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace({ visibility: "private" }));
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Make public<");
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme"))).not.toContain("Make private");
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.viewWorkspace.mockResolvedValueOnce(global);
    expect(renderToStaticMarkup(await workspacePage("global"))).not.toContain("Make private");
  });

  it("an unknown or malformed name is a 404", async () => {
    session.getCurrentUser.mockResolvedValue({ role: "root" });
    workspaces.viewWorkspace.mockResolvedValue(null);
    await expect(workspacePage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(workspacePage("%")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(workspaces.viewWorkspace).toHaveBeenLastCalledWith(expect.any(Headers), "%");
    expect(scopes.pageScopes).not.toHaveBeenCalled();
  });
});

describe("a workspace's pinned items (125)", () => {
  const pinned = {
    entries: [
      {
        id: "i1",
        workspace: "acme",
        privateWorkspace: false,
        personalWorkspace: false,
        scope: "team",
        name: "fmt",
        type: "skill",
        version: "1.0.0",
        description: "Formats.",
        keywords: [],
        publishedAt: new Date("2026-09-20T10:00:00Z"),
        lastPublishedAt: new Date("2026-09-20T10:00:00Z"),
        risky: false,
        deprecatedMessage: null,
        installable: true,
        downloadCount: 1,
        support: { "claude-code": "native", codex: "native", cursor: "native" },
      },
    ],
    starred: [] as string[],
  };
  const render = async (user: { id: string; role: string; workspaces: Record<string, string> }) => {
    session.getCurrentUser.mockResolvedValueOnce(user);
    workspaces.viewWorkspace.mockResolvedValueOnce(workspace());
    return renderToStaticMarkup(
      await AdminWorkspace({
        params: Promise.resolve({ name: "acme" }),
        searchParams: Promise.resolve({}),
      }),
    );
  };

  it("shows the shelf to a member, without Manage", async () => {
    shelves.loadPinnedShelf.mockResolvedValueOnce(pinned);
    const html = await render({ id: "m", role: "user", workspaces: { w1: "user" } });
    expect(html).toContain(">Pinned items<");
    expect(html).toContain("@acme/team/fmt");
    expect(html).not.toContain('aria-label="Manage acme"');
  });

  it("gives its admin and root Manage", async () => {
    const people: Parameters<typeof render>[0][] = [
      { id: "a", role: "user", workspaces: { w1: "admin" } },
      { id: "r", role: "root", workspaces: {} },
    ];
    for (const user of people) {
      shelves.loadPinnedShelf.mockResolvedValueOnce(pinned);
      expect(await render(user)).toContain('aria-label="Manage acme"');
    }
  });

  it("a moderator is not an admin: no Manage", async () => {
    shelves.loadPinnedShelf.mockResolvedValueOnce(pinned);
    const html = await render({ id: "o", role: "user", workspaces: { w1: "moderator" } });
    expect(html).toContain(">Pinned items<");
    expect(html).not.toContain("Manage acme");
  });

  it("shows nothing, not even a heading, when nothing is pinned", async () => {
    const html = await render({ id: "a", role: "user", workspaces: { w1: "admin" } });
    expect(html).not.toContain("Pinned items");
  });

  it("asks for this workspace's shelf", async () => {
    shelves.loadPinnedShelf.mockResolvedValueOnce(pinned);
    await render({ id: "m", role: "user", workspaces: { w1: "user" } });
    expect(shelves.loadPinnedShelf).toHaveBeenLastCalledWith(expect.any(Headers), {
      kind: "workspace",
      workspaceId: "w1",
    });
  });
});
