import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDetail } from "@/server/domains/identity/actions/user-admin";
import type { UserSummary } from "@/server/domains/identity/models/user";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn(), PATH_HEADER: "x-ronne-path" }));
const admin = vi.hoisted(() => ({ adminGetUser: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/identity/actions/user-admin", () => admin);
vi.mock("@/server/domains/workspaces/actions/workspaces", () => ({
  listWorkspaces: vi.fn(async () => [{ id: "w1", name: "global", isGlobal: true }]),
}));
vi.mock("@/server/http/request-headers", () => ({
  requestHeaders: async () => new Headers({ "x-ronne-path": "/admin/users/x" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/admin/users/x",
  useRouter: () => ({ refresh: () => {} }),
}));

const { UserPage } = await import("./UserPage");
const { default: UserRoute } = await import("@/app/(app)/admin/users/[id]/page");
const { UserNotFoundError } = await import("@/server/domains/identity/exceptions/errors");

const ID = "01K6BZ3W1D8J9Q2R4T6V8X0Y2Z";
const user = (overrides: Partial<UserSummary> = {}): UserSummary => ({
  id: ID,
  email: "sam@example.com",
  name: "Sam Lee",
  role: "user",
  disabledAt: null,
  erasedAt: null,
  createdAt: new Date("2026-09-20T10:00:00Z"),
  twoFactor: false,
  workspaces: [{ name: "global", role: "user" }],
  lastSignInAt: new Date("2026-10-19T14:30:00Z"),
  ...overrides,
});
const detail = (overrides: Partial<UserSummary> = {}, counts = { sessions: 2, tokens: 3 }) =>
  ({ user: user(overrides), ...counts }) satisfies UserDetail;

const slots = {
  role: <button type="button">SLOT-ROLE</button>,
  access: <button type="button">SLOT-ACCESS</button>,
  workspaces: <button type="button">SLOT-WORKSPACES</button>,
  data: <button type="button">SLOT-DATA</button>,
  erase: <button type="button">SLOT-ERASE</button>,
};
const page = (d: UserDetail, self = false, withSlots = true) =>
  renderToStaticMarkup(<UserPage detail={d} self={self} slots={withSlots ? slots : {}} />);

describe("a user's page (123)", () => {
  it("shows the account, the access counts, the workspaces and the way back", () => {
    const html = page(detail());
    for (const text of [
      ">Sam Lee<",
      "sam@example.com",
      "Account",
      "Sign-in and access",
      "Workspaces",
      "Their data",
      "Erase this account",
      ">Active<",
      "2026-09-20",
      "Last sign-in",
      ">Off<",
      ">Sessions<",
      ">Access tokens<",
      ">global<",
      'href="/admin/users"',
      'href="/admin/audit?actor=sam%40example.com"',
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).toMatch(/Sessions<\/dt><dd[^>]*>2</);
    expect(html).toMatch(/Access tokens<\/dt><dd[^>]*>3</);
    // Every action's slot shows, each in its section.
    for (const slot of ["ROLE", "ACCESS", "WORKSPACES", "DATA", "ERASE"])
      expect(html, slot).toContain(`SLOT-${slot}`);
  });

  it("says what counts as a sign-in, and shows Never when there is none", () => {
    expect(page(detail({ lastSignInAt: null }))).toMatch(/Last sign-in<\/dt><dd[^>]*>Never</);
    const html = page(detail());
    expect(html).toContain("2026-10-19 14:30 UTC");
    expect(html).toContain("Not rmk");
  });

  it("shows two-factor, and a disabled account's date", () => {
    expect(page(detail({ twoFactor: true }))).toMatch(/Two-factor<\/dt><dd[^>]*>On</);
    const html = page(detail({ disabledAt: new Date("2026-10-01T10:00:00Z") }));
    expect(html).toContain("Disabled on");
    expect(html).toContain("2026-10-01");
    expect(html).toContain(">Disabled<");
  });

  it("lists a user's workspaces highest role first, and says root is in every one", () => {
    const html = page(
      detail({
        workspaces: [
          { name: "global", role: "user" },
          { name: "ops", role: "admin" },
          { name: "beta", role: "moderator" },
        ],
      }),
    );
    expect(html.indexOf(">ops<")).toBeLessThan(html.indexOf(">beta<"));
    expect(html.indexOf(">beta<")).toBeLessThan(html.indexOf(">global<"));
    expect(page(detail({ workspaces: [] }))).toContain("None.");
    expect(page(detail({ role: "root", workspaces: [] }))).toContain("Root: every workspace.");
    expect(page(detail({ role: "root", workspaces: [] }))).toContain(">root<");
  });

  it("shows a SCIM-managed account's provider, and warns that a sync can undo a change", () => {
    const scim = {
      providerId: "acme",
      providerName: "Acme SSO",
      managed: true,
      adoptedAt: null,
      deprovisionedAt: null,
    };
    const html = page(detail({ scim }));
    expect(html).toContain("Managed by Acme SSO");
    expect(html).toContain("Acme SSO manages this account through SCIM.");
    // No warning for one SCIM no longer manages, and none without a link.
    expect(page(detail({ scim: { ...scim, managed: false } }))).not.toContain(
      "manages this account",
    );
    expect(page(detail())).not.toContain("SCIM");
  });

  it("an erased account shows its pseudonym and no time, and only the data download", () => {
    const html = page(
      detail({
        email: "deleted-user-01K6@ronne.invalid",
        name: "deleted-user-01K6",
        erasedAt: new Date("2026-10-10T10:00:00Z"),
        lastSignInAt: null,
      }),
    );
    expect(html).toContain("Erased on");
    expect(html).toContain("2026-10-10");
    expect(html).toMatch(/Last sign-in<\/dt><dd[^>]*>–</);
    expect(html).not.toContain("Never");
    // The status says it: no Provider row repeating the badge.
    expect(html).not.toContain(">Provider<");
    expect(html).toContain("SLOT-DATA");
    for (const slot of ["ROLE", "ACCESS", "WORKSPACES", "ERASE"])
      expect(html, slot).not.toContain(`SLOT-${slot}`);
    expect(html).not.toContain("Erase this account");
  });

  it("your own page is read-only, with the reason and no action", () => {
    const html = page(detail({ role: "root", workspaces: [] }), true);
    expect(html).toContain("This is your own account.");
    expect(html).toContain("Another root changes your role");
    expect(html).not.toContain("SLOT-");
    expect(html).not.toContain("Erase this account");
    // Nor the SCIM warning, which is about changes you can't make here.
    expect(
      page(
        detail({
          scim: {
            providerId: "acme",
            providerName: "Acme",
            managed: true,
            adoptedAt: null,
            deprovisionedAt: null,
          },
        }),
        true,
      ),
    ).not.toContain("manages this account");
  });

  it("renders without slots, so the sections stand alone", () => {
    const html = page(detail(), false, false);
    expect(html).toContain("Erase this account");
    expect(html).not.toContain("SLOT-");
  });
});

describe("the route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    admin.adminGetUser.mockResolvedValue(detail());
  });

  it("is a 404 for anyone but root, without reading the user", async () => {
    for (const current of [null, { role: "user" }, { role: "user", workspaces: { w: "admin" } }]) {
      session.getCurrentUser.mockResolvedValue(current);
      await expect(UserRoute({ params: Promise.resolve({ id: ID }) })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
    }
    expect(admin.adminGetUser).not.toHaveBeenCalled();
  });

  it("is a 404 for an id that isn't a user's, and rethrows anything else", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "root-id", role: "root" });
    admin.adminGetUser.mockRejectedValueOnce(new UserNotFoundError());
    await expect(UserRoute({ params: Promise.resolve({ id: "nope" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    admin.adminGetUser.mockRejectedValueOnce(new Error("database is down"));
    await expect(UserRoute({ params: Promise.resolve({ id: ID }) })).rejects.toThrow(
      "database is down",
    );
  });

  it("mounts the actions of the list's dialogs on another user's page", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "root-id", role: "root" });
    const html = renderToStaticMarkup(await UserRoute({ params: Promise.resolve({ id: ID }) }));
    for (const label of [
      "Change role",
      "Reset password",
      "Disable",
      "Manage workspaces",
      "Download their data",
      "Erase",
    ])
      expect(html, label).toMatch(new RegExp(`<button[^>]*>${label}</button>`));
    expect(html).not.toContain("Reset two-factor");
    expect(html).not.toMatch(/>Enable</);
  });

  it("offers Enable for a disabled account and Reset two-factor only when it's on", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "root-id", role: "root" });
    admin.adminGetUser.mockResolvedValue(
      detail({ disabledAt: new Date("2026-10-01T10:00:00Z"), twoFactor: true }),
    );
    const html = renderToStaticMarkup(await UserRoute({ params: Promise.resolve({ id: ID }) }));
    expect(html).toMatch(/<button[^>]*>Enable<\/button>/);
    expect(html).not.toMatch(/<button[^>]*>Disable<\/button>/);
    expect(html).toMatch(/<button[^>]*>Reset two-factor<\/button>/);
  });

  it("gives another root the actions, but no Workspaces dialog: root works in every one", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "root-id", role: "root" });
    admin.adminGetUser.mockResolvedValue(detail({ role: "root", workspaces: [] }));
    const html = renderToStaticMarkup(await UserRoute({ params: Promise.resolve({ id: ID }) }));
    expect(html).toMatch(/<button[^>]*>Change role<\/button>/);
    expect(html).not.toContain("Manage workspaces");
  });

  it("gives your own page no action, and an erased account only the greyed download", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "root-id", role: "root" });
    admin.adminGetUser.mockResolvedValue(detail({ id: "root-id", role: "root", workspaces: [] }));
    const own = renderToStaticMarkup(
      await UserRoute({ params: Promise.resolve({ id: "root-id" }) }),
    );
    // The helper is a button too, so name the actions.
    for (const label of ["Change role", "Reset password", "Disable", "Download", "Erase"])
      expect(own, label).not.toContain(`>${label}`);
    admin.adminGetUser.mockResolvedValue(
      detail({
        email: "deleted-user-01K6@ronne.invalid",
        erasedAt: new Date("2026-10-10T10:00:00Z"),
        lastSignInAt: null,
      }),
    );
    const erased = renderToStaticMarkup(await UserRoute({ params: Promise.resolve({ id: ID }) }));
    expect(erased.match(/<button[^>]*disabled/g)).toHaveLength(1);
    expect(erased).toContain("Download the data of deleted-user-01K6@ronne.invalid: erased");
    expect(erased).toMatch(/<button[^>]*disabled/);
    for (const label of ["Change role", "Reset password", "Disable", "Erase"])
      expect(erased, label).not.toContain(`>${label}<`);
  });

  it("gives root the user's page, and root's own page read-only", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "root-id", role: "root" });
    const other = renderToStaticMarkup(await UserRoute({ params: Promise.resolve({ id: ID }) }));
    expect(other).toContain("Sam Lee");
    expect(other).not.toContain("This is your own account.");
    expect(admin.adminGetUser).toHaveBeenCalledWith(expect.any(Headers), ID);
    admin.adminGetUser.mockResolvedValue(detail({ id: "root-id", role: "root" }));
    const own = renderToStaticMarkup(
      await UserRoute({ params: Promise.resolve({ id: "root-id" }) }),
    );
    expect(own).toContain("This is your own account.");
  });
});
