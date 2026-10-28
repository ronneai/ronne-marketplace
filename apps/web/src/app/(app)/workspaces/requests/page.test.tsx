import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const workspaces = vi.hoisted(() => ({
  requestsToAnswerList: vi.fn(),
  movesToAnswer: vi.fn(async () => ({ moves: [], total: 0 })),
  itemMovesToAnswer: vi.fn(async () => ({ moves: [], total: 0 })),
}));
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
  approveMoveFromForm: vi.fn(),
  declineMoveFromForm: vi.fn(),
  approveItemMoveFromForm: vi.fn(),
  declineItemMoveFromForm: vi.fn(),
}));
vi.mock("@/features/item-move/actions", () => ({}));
vi.mock("@/features/admin-workspaces/actions", () => ({
  askMoveFromForm: vi.fn(),
  cancelMoveFromForm: vi.fn(),
  moveImpactFor: vi.fn(),
  moveTargetsFor: vi.fn(),
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

  it("lists the scope moves for root and shared admins, not for moderators (115)", async () => {
    workspaces.requestsToAnswerList.mockResolvedValue({ requests: [], total: 0 });
    workspaces.movesToAnswer.mockResolvedValue({
      moves: [
        {
          id: "m1",
          scope: "@beta/infra",
          newName: "@acme/infra",
          renamed: false,
          from: "beta",
          to: "acme",
          items: 2,
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
    for (const me of [
      { role: "root", workspaces: {} },
      { role: "user", workspaces: { acme: "admin" } },
    ]) {
      session.getCurrentUser.mockResolvedValue(me);
      const html = renderToStaticMarkup(await WorkspaceRequests());
      expect(html, me.role).toContain("Scope moves");
      expect(html, me.role).toContain("@beta/infra");
      expect(html, me.role).toContain('aria-label="Approve moving @beta/infra to acme"');
    }
    session.getCurrentUser.mockResolvedValue({ role: "user", workspaces: { acme: "moderator" } });
    expect(renderToStaticMarkup(await WorkspaceRequests())).not.toContain("Scope moves");
  });

  it("lists the item moves for a workspace's moderators (134)", async () => {
    session.getCurrentUser.mockResolvedValue({ role: "user", workspaces: { acme: "moderator" } });
    workspaces.requestsToAnswerList.mockResolvedValue({ requests: [], total: 0 });
    workspaces.itemMovesToAnswer.mockResolvedValue({
      moves: [
        {
          id: "m1",
          item: "@acme/infra/deploy",
          type: "skill",
          newName: "@acme/devops/deploy",
          from: "@acme/infra",
          to: "@acme/devops",
          workspace: "acme",
          askedBy: { email: "ana@example.com", name: "Ana" },
          createdAt: new Date("2026-10-27T10:00:00Z"),
          message: null,
          refusal: null,
        },
      ],
      total: 1,
    } as never);
    const html = renderToStaticMarkup(await WorkspaceRequests());
    expect(html).toContain(">Item moves<");
    expect(html).toContain("Items members asked to move to another scope");
    expect(html).toContain("@acme/devops/deploy");
  });

  it("is a 404 for someone who answers nowhere", async () => {
    session.getCurrentUser.mockResolvedValue({ role: "user", workspaces: { g: "user" } });
    await expect(WorkspaceRequests()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(workspaces.requestsToAnswerList).not.toHaveBeenCalled();
  });
});
