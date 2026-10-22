import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hold", () => ({ holdPage: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
const domain = vi.hoisted(() => ({ pageFeedback: vi.fn(), countFeedback: vi.fn() }));
vi.mock("@/server/domains/feedback/actions/feedback", () => domain);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/features/admin-feedback/actions", () => ({
  markHandledAction: vi.fn(),
  deleteFeedbackAction: vi.fn(),
}));

const { default: Page } = await import("./page");

const props = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) });

describe("Admin › Feedback page (127)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    domain.pageFeedback.mockResolvedValue({ rows: [], next: null, previous: null });
    domain.countFeedback.mockResolvedValue({ count: 0, capped: false });
  });

  it("is a 404 for anyone who is not root, and reads nothing", async () => {
    for (const user of [null, { id: "u", role: "user", workspaces: {} }]) {
      session.getCurrentUser.mockResolvedValue(user);
      await expect(Page(props())).rejects.toThrow("NOT_FOUND");
    }
    expect(domain.pageFeedback).not.toHaveBeenCalled();
  });

  it("shows root the inbox, with the view asked for in the address", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "r", role: "root", workspaces: {} });
    const html = renderToStaticMarkup(await Page(props({ kind: "idea", status: "new", q: "x" })));
    expect(html).toContain("No feedback matches these filters.");
    expect(domain.pageFeedback).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ kind: "idea", status: "new", search: "x", sort: "created" }),
    );
    expect(domain.countFeedback).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ kind: "idea", status: "new", search: "x" }),
    );
  });
});
