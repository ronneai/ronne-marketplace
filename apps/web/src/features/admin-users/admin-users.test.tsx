import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSummary } from "@/server/domains/identity/models/user";
import { parseUsersQuery, usersPageUrl } from "./query";

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
  role: "moderator",
  disabledAt: null,
  createdAt: new Date("2026-09-20T10:00:00Z"),
  ...overrides,
});
const noFilters = { q: "", role: "", status: "" };

describe("parseUsersQuery", () => {
  it("reads valid filters and ignores the rest", () => {
    expect(
      parseUsersQuery({ q: "  Alex ", role: "moderator", status: "disabled", cursor: ULID }),
    ).toEqual({
      filters: { q: "Alex", role: "moderator", status: "disabled" },
      search: "Alex",
      role: "moderator",
      status: "disabled",
      cursor: ULID,
    });
    expect(parseUsersQuery({ role: "admin", status: "gone", cursor: "x" })).toEqual({
      filters: noFilters,
      search: undefined,
      role: undefined,
      status: undefined,
      cursor: undefined,
    });
    expect(parseUsersQuery({ q: "x".repeat(300) }).search).toHaveLength(100);
  });

  it("builds page URLs that keep the filters", () => {
    expect(usersPageUrl({ q: "a b", role: "", status: "active" }, ULID)).toBe(
      `/admin/users?q=a+b&status=active&cursor=${ULID}`,
    );
  });
});

describe("UsersPage", () => {
  it("lists users with their role and status", () => {
    const html = renderToStaticMarkup(
      <UsersPage
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
        nextCursor={ULID}
        filters={noFilters}
        paged={false}
        actions={(u) => <span>menu for {u.email}</span>}
      />,
    );
    for (const text of [
      "Users",
      "alex@example.com",
      ">moderator<",
      ">disabled<",
      ">active<",
      "2026-09-20",
      "menu for old@example.com",
      `href="/admin/users?cursor=${ULID}"`,
    ]) {
      expect(html, text).toContain(text);
    }
  });

  it("says when nothing matches", () => {
    const html = renderToStaticMarkup(
      <UsersPage users={[]} nextCursor={null} filters={{ ...noFilters, q: "zzz" }} paged />,
    );
    expect(html).toContain("No users match these filters.");
    expect(html).toContain("First page");
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
    admin.adminListUsers.mockResolvedValue({ users: [user()], nextCursor: null });
  });

  it("the admin layout and the users page are a 404 for anyone but root", async () => {
    for (const current of [null, { role: "user" }, { role: "moderator" }]) {
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
      await UsersRoute({ searchParams: Promise.resolve({ q: "alex", role: "moderator" }) }),
    );
    expect(page).toContain("alex@example.com");
    expect(admin.adminListUsers).toHaveBeenCalledWith(expect.any(Headers), {
      search: "alex",
      role: "moderator",
      status: undefined,
      cursor: undefined,
    });
  });
});
