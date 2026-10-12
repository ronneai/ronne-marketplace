import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ requireUser: vi.fn() }));
const reviews = vi.hoisted(() => ({ countNeedsReview: vi.fn() }));
const workspaces = vi.hoisted(() => ({
  requestsToAnswer: vi.fn(),
  countMovesToAnswer: vi.fn(),
  myWorkspacesAs: vi.fn(),
}));
const cookie = vi.hoisted(() => ({
  value: undefined as string | undefined,
  workspace: undefined as string | undefined,
}));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/submissions/actions/reviews", () => reviews);
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value =
        name === "ronne-sidebar"
          ? cookie.value
          : name === "ronne-workspace"
            ? cookie.workspace
            : undefined;
      return value ? { value } : undefined;
    },
  }),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { loadShell, workspaceView } = await import("./shell");

const user = (workspaces: Record<string, string>, role = "user") => ({
  id: "u",
  name: "U",
  email: "u@example.com",
  role,
  workspaces,
});

beforeEach(() => {
  vi.clearAllMocks();
  reviews.countNeedsReview.mockResolvedValue(4);
  workspaces.requestsToAnswer.mockResolvedValue(2);
  workspaces.countMovesToAnswer.mockResolvedValue(3);
  workspaces.myWorkspacesAs.mockResolvedValue([]);
  cookie.value = undefined;
  cookie.workspace = undefined;
});

// The nav counts (014, 094): each counted only for someone who can act on it.
describe("loadShell's nav counts", () => {
  it("counts reviews and requests to join for a moderator", async () => {
    session.requireUser.mockResolvedValue(user({ global: "user", acme: "moderator" }));
    expect((await loadShell()).navCounts).toEqual({
      "/reviews": 4,
      "/workspaces/requests": 2,
    });
  });

  it("counts them for root too, with the scope moves waiting (115)", async () => {
    session.requireUser.mockResolvedValue(user({}, "root"));
    expect((await loadShell()).navCounts["/workspaces/requests"]).toBe(5);
  });

  it("adds the scope moves for a shared workspace's admin, not for a moderator (115)", async () => {
    session.requireUser.mockResolvedValue(user({ global: "user", acme: "admin" }));
    expect((await loadShell()).navCounts["/workspaces/requests"]).toBe(5);
    session.requireUser.mockResolvedValue(user({ global: "user", acme: "moderator" }));
    expect((await loadShell()).navCounts["/workspaces/requests"]).toBe(2);
    expect(workspaces.countMovesToAnswer).toHaveBeenCalledTimes(1);
  });

  it("counts nothing, and asks nothing, for someone who answers nowhere", async () => {
    session.requireUser.mockResolvedValue(user({ global: "user" }));
    expect((await loadShell()).navCounts).toEqual({ "/reviews": 0, "/workspaces/requests": 0 });
    expect(workspaces.requestsToAnswer).not.toHaveBeenCalled();
    expect(reviews.countNeedsReview).not.toHaveBeenCalled();
  });
});

// The sidebar (119): the switcher's workspaces and whether it's folded.
describe("loadShell's sidebar", () => {
  it("lists only the workspaces they're a member of, in the order given", async () => {
    session.requireUser.mockResolvedValue(
      user({ global: "user", mine: "admin", acme: "moderator" }),
    );
    workspaces.myWorkspacesAs.mockResolvedValue([
      { name: "ana", role: "admin", personal: true, visibility: "private", isGlobal: false },
      { name: "global", role: "user", personal: false, visibility: "public", isGlobal: true },
      { name: "acme", role: "moderator", personal: false, visibility: "private", isGlobal: false },
      { name: "open", role: null, personal: false, visibility: "public", isGlobal: false },
    ]);
    expect((await loadShell()).workspaces).toEqual([
      { name: "ana", role: "admin", personal: true },
      { name: "global", role: "user", personal: false },
      { name: "acme", role: "moderator", personal: false },
    ]);
  });

  it("reads the fold cookie: folded only when it says so", async () => {
    session.requireUser.mockResolvedValue(user({ global: "user" }));
    expect((await loadShell()).folded).toBe(false);
    cookie.value = "folded";
    expect((await loadShell()).folded).toBe(true);
    cookie.value = "sideways";
    expect((await loadShell()).folded).toBe(false);
  });
});

// The current workspace (120): the cookie's, only while the user is a member of it.
describe("loadShell's current workspace", () => {
  it("is the cookie's member workspace, and none for a stale or foreign one", async () => {
    session.requireUser.mockResolvedValue(user({ global: "user", acme: "user" }));
    workspaces.myWorkspacesAs.mockResolvedValue([
      { name: "global", role: "user", personal: false },
      { name: "acme", role: "user", personal: false },
      { name: "open", role: null, personal: false },
    ]);
    expect((await loadShell()).current).toBeNull();
    cookie.workspace = "acme";
    expect((await loadShell()).current).toBe("acme");
    cookie.workspace = "open";
    expect((await loadShell()).current).toBeNull();
    cookie.workspace = "gone";
    expect((await loadShell()).current).toBeNull();
  });
});

// What a filtered page shows (120), and what its links keep.
describe("workspaceView", () => {
  beforeEach(() => {
    session.requireUser.mockResolvedValue(user({ global: "user", acme: "user" }));
    workspaces.myWorkspacesAs.mockResolvedValue([
      { name: "global", role: "user", personal: false },
      { name: "acme", role: "user", personal: false },
    ]);
  });

  it("without a current workspace: what the URL says, or every workspace with nothing to keep", async () => {
    expect(await workspaceView("/reviews", {})).toMatchObject({
      workspace: null,
      keepAll: false,
      fixed: {},
    });
    expect(await workspaceView("/reviews", { workspace: "beta" })).toMatchObject({
      workspace: "beta",
      fixed: { workspace: "beta" },
    });
  });

  it("with one: redirects so the URL says it, and keeps an explicit All", async () => {
    cookie.workspace = "acme";
    await expect(workspaceView("/reviews", { tab: "waiting" })).rejects.toThrow(
      "REDIRECT /reviews?tab=waiting&workspace=acme",
    );
    expect(await workspaceView("/reviews", { workspace: "acme" })).toMatchObject({
      workspace: "acme",
      keepAll: true,
      fixed: { workspace: "acme" },
    });
    expect(await workspaceView("/reviews", { workspace: "" })).toMatchObject({
      workspace: null,
      keepAll: true,
      fixed: { workspace: "" },
    });
  });

  it("leaves the sidebar's counts alone: they count every workspace (120)", async () => {
    session.requireUser.mockResolvedValue(user({ global: "user", acme: "moderator" }));
    const before = (await loadShell()).navCounts;
    cookie.workspace = "acme";
    expect((await loadShell()).navCounts).toEqual(before);
    expect(reviews.countNeedsReview).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("ignores a cookie for a workspace the user isn't in", async () => {
    cookie.workspace = "secret";
    expect(await workspaceView("/reviews", {})).toMatchObject({ workspace: null, fixed: {} });
  });
});
