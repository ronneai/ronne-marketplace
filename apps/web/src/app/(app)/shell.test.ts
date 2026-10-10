import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ requireUser: vi.fn() }));
const reviews = vi.hoisted(() => ({ countNeedsReview: vi.fn() }));
const workspaces = vi.hoisted(() => ({ requestsToAnswer: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/submissions/actions/reviews", () => reviews);
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { loadShell } = await import("./shell");

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

  it("counts them for root too", async () => {
    session.requireUser.mockResolvedValue(user({}, "root"));
    expect((await loadShell()).navCounts["/workspaces/requests"]).toBe(2);
  });

  it("counts nothing, and asks nothing, for someone who answers nowhere", async () => {
    session.requireUser.mockResolvedValue(user({ global: "user" }));
    expect((await loadShell()).navCounts).toEqual({ "/reviews": 0, "/workspaces/requests": 0 });
    expect(workspaces.requestsToAnswer).not.toHaveBeenCalled();
    expect(reviews.countNeedsReview).not.toHaveBeenCalled();
  });
});
