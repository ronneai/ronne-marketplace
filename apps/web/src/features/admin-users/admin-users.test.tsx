import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import type { UserSummary } from "@/server/domains/identity/models/user";
import { checkedUsersState, USERS_LIST, usersQueryOf } from "./list";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn(), PATH_HEADER: "x-ronne-path" }));
const admin = vi.hoisted(() => ({ adminListUsers: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/identity/actions/user-admin", () => admin);
vi.mock("@/server/http/request-headers", () => ({
  requestHeaders: async () => new Headers({ "x-ronne-path": "/admin/users?q=x" }),
}));
const navigation = vi.hoisted(() => ({ path: "/admin/users" }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => navigation.path,
}));

const { UsersPage } = await import("./UsersPage");
const { AdminNav } = await import("../admin/AdminNav");
const { default: UsersRoute } = await import("@/app/(app)/admin/users/page");
const { default: AdminLayout } = await import("@/app/(app)/admin/layout");

const ULID = "01K6BZ3W1D8J9Q2R4T6V8X0Y2Z";
const user = (overrides: Partial<UserSummary> = {}): UserSummary => ({
  id: ULID,
  email: "alex@example.com",
  name: "Alex",
  role: "user",
  disabledAt: null,
  createdAt: new Date("2026-09-20T10:00:00Z"),
  ...overrides,
});
const noFilters = { q: "", role: "", status: "" };

const state = (params: Record<string, string> = {}) =>
  checkedUsersState(parseListQuery(USERS_LIST, params));

describe("the users list's URL (061)", () => {
  it("turns a view into the server query", () => {
    expect(
      usersQueryOf(state({ q: "Alex", role: "user", status: "disabled", sort: "email" })),
    ).toEqual({
      sort: "email",
      dir: "asc",
      size: 50,
      cursor: undefined,
      search: "Alex",
      role: "user",
      status: "disabled",
    });
  });

  it("drops a role or status it doesn't know", () => {
    expect(state({ role: "admin", status: "gone" }).filters).toEqual({
      q: "",
      role: "",
      status: "",
    });
  });
});

const page = (props: Partial<Parameters<typeof UsersPage>[0]> = {}) =>
  renderToStaticMarkup(
    <UsersPage
      state={state()}
      users={[
        user(),
        user({
          id: "01K6BZ3W1D8J9Q2R4T6V8X0Y30",
          email: "old@example.com",
          role: "user",
          disabledAt: new Date(),
        }),
        user({ id: "01K6BZ3W1D8J9Q2R4T6V8X0Y31", email: "root@example.com", role: "root" }),
      ]}
      page={{ next: "c2", previous: null }}
      total={{ count: 3, capped: false }}
      actions={(u) => <span>menu for {u.email}</span>}
      {...props}
    />,
  );

describe("UsersPage (061)", () => {
  it("shows root, or a badge per workspace role with how many workspaces (091, 092)", () => {
    const html = page({
      users: [
        user({ id: "01K6BZ3W1D8J9Q2R4T6V8X0Y21", email: "r@example.com", role: "root" }),
        user({
          id: "01K6BZ3W1D8J9Q2R4T6V8X0Y22",
          email: "m@example.com",
          workspaces: [
            // A lower role first, so taking the first workspace's role would fail.
            { name: "global", role: "user" },
            { name: "acme", role: "moderator" },
            { name: "ops", role: "admin" },
            { name: "beta", role: "moderator" },
          ],
        }),
        user({
          id: "01K6BZ3W1D8J9Q2R4T6V8X0Y23",
          email: "p@example.com",
          workspaces: [{ name: "global", role: "user" }],
        }),
      ],
    });
    expect(html).toContain(">root<");
    expect(html).not.toContain("All workspaces");
    // A badge per role, highest first, each with its count; names only on hover (092).
    expect(html).toMatch(
      /gap-1\.5"><span>admin<\/span><span class="font-mono font-normal">1<\/span>.*<span>moderator<\/span><span[^>]*>2<.*<span>user<\/span><span[^>]*>1</,
    );
    expect(html).toContain('title="global: user, acme: moderator, ops: admin, beta: moderator"');
    // In no workspace (not reachable while everyone is in global): "none".
    expect(page({ users: [user({ workspaces: [] })] })).toContain(">none<");
  });

  it("lists users with their role, status and actions, sortable by email, name and created", () => {
    const html = page();
    for (const text of [
      "Users",
      "alex@example.com",
      ">user<",
      ">disabled<",
      ">active<",
      "2026-09-20",
      "menu for old@example.com",
      "3 users",
      'href="/admin/users?cursor=c2"',
      'href="/admin/users?sort=email"',
      'href="/admin/users?sort=name"',
      'href="/admin/users?dir=asc"',
      'aria-sort="descending"',
    ]) {
      expect(html, text).toContain(text);
    }
  });

  it("shows active filters as chips, and says when nothing matches", () => {
    const html = page({ state: state({ q: "zzz", role: "root" }), users: [] });
    expect(html).toContain("No users match these filters.");
    expect(html).toMatch(
      /aria-label="Remove the search filter"[^>]*href="\/admin\/users\?role=root"/,
    );
    expect(html).toMatch(/aria-label="Remove the role filter"[^>]*href="\/admin\/users\?q=zzz"/);
  });
});

describe("AdminNav", () => {
  it("marks the current section from the live path", () => {
    navigation.path = "/admin/audit";
    const html = renderToStaticMarkup(<AdminNav />);
    expect(html).toMatch(/aria-current="page"[^>]*>Audit log</);
    expect(html).not.toMatch(/aria-current="page"[^>]*>Users</);
  });
});

describe("root only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.path = "/admin/users";
    admin.adminListUsers.mockResolvedValue({
      users: [user()],
      next: null,
      previous: null,
      total: { count: 1, capped: false },
    });
  });

  it("the admin layout and the users page are a 404 for anyone but root", async () => {
    for (const current of [
      null,
      { role: "user" },
      { role: "user", workspaces: { global: "moderator" } },
    ]) {
      session.getCurrentUser.mockResolvedValue(current);
      await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(UsersRoute({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
    }
    expect(admin.adminListUsers).not.toHaveBeenCalled();
  });

  it("root gets the layout with its navigation, and the list", async () => {
    session.getCurrentUser.mockResolvedValue({ role: "root" });
    const layout = renderToStaticMarkup(await AdminLayout({ children: <p>inside</p> }));
    expect(layout).toMatch(/aria-current="page"[^>]*>Users</);
    expect(layout).toContain("inside");
    const page = renderToStaticMarkup(
      await UsersRoute({ searchParams: Promise.resolve({ q: "alex", role: "root" }) }),
    );
    expect(page).toContain("alex@example.com");
    expect(admin.adminListUsers).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ search: "alex", role: "root", sort: "created", size: 50 }),
    );
  });
});
