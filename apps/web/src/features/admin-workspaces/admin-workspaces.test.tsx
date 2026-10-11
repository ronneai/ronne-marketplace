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

const workspaces = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  pageWorkspaces: vi.fn(),
  findWorkspace: vi.fn(),
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
  usePathname: () => "/admin/workspaces",
  useRouter: () => ({ refresh: () => {} }),
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

  it("renames, refreshes every page and goes to the new address (113)", async () => {
    workspaces.renameWorkspace.mockResolvedValueOnce(workspace({ name: "acme-platform" }));
    await expect(
      actions.renameWorkspaceFromForm({}, form({ name: "acme", to: "ACME-Platform " })),
    ).rejects.toThrow("NEXT_REDIRECT /admin/workspaces/acme-platform");
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
        kinds
      />,
    );
    for (const text of [">Owner<", "ana@example.com", 'id="workspace-kind"', ">Personal<"])
      expect(html, text).toContain(text);
    expect(html).not.toContain(">Moderators<");
    expect(html).not.toContain(">Visibility<");
    // Without the filter (a workspace admin's list), no Kind.
    expect(table({}, [workspace()])).not.toContain('id="workspace-kind"');
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

describe("the admin nav", () => {
  it("shows a workspace's admin only Workspaces (092)", () => {
    const html = renderToStaticMarkup(<AdminNav root={false} />);
    expect(html).toContain(">Workspaces<");
    for (const label of ["Users", "Scopes", "Audit log", "Settings"])
      expect(html, label).not.toContain(`>${label}<`);
  });

  it("has Workspaces, before Scopes", () => {
    const html = renderToStaticMarkup(<AdminNav />);
    expect(html).toContain('href="/admin/workspaces"');
    expect(html.indexOf("/admin/workspaces")).toBeLessThan(html.indexOf("/admin/scopes"));
    expect(html).toMatch(
      /aria-current="page"[^>]*>Workspaces|href="\/admin\/workspaces"[^>]*aria-current="page"/,
    );
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

  it("are a 404 for anyone but root and workspace admins, without reading anything", async () => {
    for (const user of [
      null,
      { role: "user" },
      { role: "user", workspaces: { global: "moderator" } },
    ]) {
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(listPage()).rejects.toThrow("NEXT_NOT_FOUND");
      session.getCurrentUser.mockResolvedValueOnce(user);
      await expect(workspacePage("acme")).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(workspaces.pageWorkspaces).not.toHaveBeenCalled();
    expect(workspaces.findWorkspace).not.toHaveBeenCalled();
  });

  it("doesn't list workspaces for someone who only owns a personal one (114)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({
      role: "user",
      workspaces: { mine: "admin" },
      personal: "mine",
    });
    await expect(listPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(workspaces.pageWorkspaces).not.toHaveBeenCalled();
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

  it("passes root's Kind to the server, and drops an admin's (114)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    await listPage({ kind: "personal" });
    expect(workspaces.pageWorkspaces).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ kind: "personal" }),
    );
    session.getCurrentUser.mockResolvedValueOnce({ role: "user", workspaces: { w1: "admin" } });
    await listPage({ kind: "personal" });
    expect(workspaces.pageWorkspaces).toHaveBeenLastCalledWith(
      expect.any(Headers),
      expect.objectContaining({ kind: "shared" }),
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
      workspaces.findWorkspace.mockResolvedValueOnce(mine);
      const html = renderToStaticMarkup(await workspacePage("ana", params));
      for (const text of [
        ">Rename<",
        "Edit description",
        "Personal",
        "Yours alone",
        'href="/workspaces"',
      ])
        expect(html, text).toContain(text);
      for (const text of [">Members<", ">Requests<", "Make public", "Delete", "All workspaces"])
        expect(html, text).not.toContain(text);
    }
    expect(workspaces.pageMembers).not.toHaveBeenCalled();
    // Root sees it as its owner's, with the same tabs and no visibility or Delete.
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(mine);
    const asRoot = renderToStaticMarkup(await workspacePage("ana"));
    expect(asRoot).toContain("Its owner&#x27;s alone");
    expect(asRoot).toContain("All workspaces");
    expect(asRoot).not.toContain("Make public");
    expect(asRoot).not.toContain(">Members<");
  });

  it("offers Move… on each scope to root and the workspace's admins, and shows a scope's move (115)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(
      'aria-label="Move @acme-infra"',
    );
    // Its admin, and a personal workspace's owner (who's its admin, 114).
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Move…<");
    // An open move: Moving to … with Cancel instead of Move….
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace({ scopes: 1 }));
    workspaces.scopeMovesIn.mockResolvedValueOnce({
      [scope().id]: { id: "m1", toWorkspace: "beta", status: "open", reason: null },
    } as never);
    const moving = renderToStaticMarkup(await workspacePage("acme"));
    expect(moving).toContain("Moving to beta");
    expect(moving).not.toContain(">Move…<");
    expect(workspaces.scopeMovesIn).toHaveBeenLastCalledWith(expect.any(Headers), {
      workspaceId: "w1",
    });
  });

  it("shows the moves into the workspace on its Requests tab (115)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace());
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
    workspaces.findWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme", { tab: "requests" }))).not.toContain(
      "Scope moves",
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

  it("root and the workspace's admin can rename it; an admin of global can't rename global (113)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Rename<");
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Rename<");
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { [global.id]: "admin" },
    });
    workspaces.findWorkspace.mockResolvedValueOnce(global);
    expect(renderToStaticMarkup(await workspacePage("global"))).not.toContain(">Rename<");
  });

  it("global's page has no edit or delete", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(global);
    const html = renderToStaticMarkup(await workspacePage("global"));
    expect(html).toContain("It can&#x27;t be changed or deleted.");
    expect(html).not.toContain(">Rename<");
    expect(html).not.toContain("Edit description");
    expect(html).not.toContain("Delete");
  });

  it("a workspace's admin gets their list, without New workspace (092)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "user", workspaces: { w1: "admin" } });
    const html = renderToStaticMarkup(await listPage());
    expect(html).not.toContain("New workspace");
    expect(html).toContain("The workspaces you administer");
    expect(html).toContain('href="/admin/workspaces/acme"');
  });

  it("an admin's workspace page has Members, Edit description and Create scope, not Delete (092)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace());
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
      'href="/admin/workspaces/acme?tab=members&amp;q=o&amp;sort=added"',
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
    workspaces.findWorkspace.mockResolvedValueOnce(workspace());
    const html = renderToStaticMarkup(await workspacePage("acme"));
    expect(html).toMatch(/aria-current="page"[^>]*>Scopes</);
    expect(html).toContain("Create scope");
    expect(html).toContain('href="/admin/workspaces/acme?tab=members"');
    expect(workspaces.pageMembers).not.toHaveBeenCalled();
  });

  it("an admin of another workspace gets a 404 here: they can't find it (092)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ role: "user", workspaces: { w2: "admin" } });
    workspaces.findWorkspace.mockResolvedValueOnce(null);
    await expect(workspacePage("acme")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(workspaces.pageMembers).not.toHaveBeenCalled();
  });

  it("global's page has members' roles but no Remove (092)", async () => {
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(global);
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
    workspaces.findWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Make private<");
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace({ visibility: "private" }));
    expect(renderToStaticMarkup(await workspacePage("acme"))).toContain(">Make public<");
    session.getCurrentUser.mockResolvedValueOnce({
      id: "a",
      role: "user",
      workspaces: { w1: "admin" },
    });
    workspaces.findWorkspace.mockResolvedValueOnce(workspace());
    expect(renderToStaticMarkup(await workspacePage("acme"))).not.toContain("Make private");
    session.getCurrentUser.mockResolvedValueOnce({ id: "r", role: "root" });
    workspaces.findWorkspace.mockResolvedValueOnce(global);
    expect(renderToStaticMarkup(await workspacePage("global"))).not.toContain("Make private");
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
