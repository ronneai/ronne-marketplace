import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const workspaces = vi.hoisted(() => ({ requestsToAnswerList: vi.fn() }));
const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("next/navigation", () => navigation);
vi.mock("@/features/workspace-requests/actions", () => ({
  approveRequestFromForm: vi.fn(),
  declineRequestFromForm: vi.fn(),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { default: WorkspaceRequests } = await import("./page");

beforeEach(() => vi.clearAllMocks());

// Requests to join (094): for root and moderators and admins anywhere; a 404 for anyone else.
describe("the Requests page", () => {
  it("lists the requests the reader can answer, with their workspaces", async () => {
    session.getCurrentUser.mockResolvedValue({ role: "user", workspaces: { acme: "moderator" } });
    workspaces.requestsToAnswerList.mockResolvedValue({
      requests: [
        {
          id: "r1",
          workspaceId: "w1",
          workspace: "acme",
          userId: "u1",
          email: "uma@example.com",
          name: "Uma",
          message: "I review agents.",
          createdAt: new Date("2026-10-09T10:00:00Z"),
          canPickRole: false,
        },
      ],
      total: 1,
    });
    const html = renderToStaticMarkup(await WorkspaceRequests());
    expect(html).toContain("Requests to join");
    expect(html).toContain("uma@example.com");
    expect(html).toContain("acme");
    expect(html).toContain("I review agents.");
    expect(html).toContain('aria-label="Approve uma@example.com"');
  });

  it("is a 404 for someone who answers nowhere", async () => {
    session.getCurrentUser.mockResolvedValue({ role: "user", workspaces: { g: "user" } });
    await expect(WorkspaceRequests()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(workspaces.requestsToAnswerList).not.toHaveBeenCalled();
  });
});
