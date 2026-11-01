import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../hold", () => ({ holdPage: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const session = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
const domain = vi.hoisted(() => ({ pageNotifications: vi.fn(), countNotifications: vi.fn() }));
vi.mock("@/server/domains/notifications/actions/notifications", () => domain);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/features/notifications/actions", () => ({ markRead: vi.fn(), markAllRead: vi.fn() }));

const { default: Page } = await import("./page");

const props = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) });

describe("the notifications page (139)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.requireUser.mockResolvedValue({ id: "u", role: "user", workspaces: {} });
    domain.pageNotifications.mockResolvedValue({ rows: [], next: null, previous: null });
    domain.countNotifications.mockResolvedValue({ count: 0, capped: false });
  });

  it("asks for the person's own, the view asked for in the address, and nobody else's", async () => {
    const html = renderToStaticMarkup(
      await Page(props({ state: "unread", kind: "submission.rejected,submission.comment" })),
    );
    expect(html).toContain("No notifications match these filters.");
    expect(domain.pageNotifications).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({
        state: "unread",
        kinds: ["submission.rejected", "submission.comment"],
        size: 25,
      }),
    );
    expect(domain.countNotifications).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({
        state: "unread",
        kinds: ["submission.rejected", "submission.comment"],
      }),
    );
    // The query never names a person: the action takes it from the session.
    expect(JSON.stringify(domain.pageNotifications.mock.calls)).not.toContain('"userId"');
  });

  it("drops a filter it doesn't know", async () => {
    await Page(props({ state: "archived", kind: "nope" }));
    expect(domain.pageNotifications).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ state: undefined, kinds: undefined }),
    );
  });

  it("shows an empty list when it can't read the session's notifications", async () => {
    domain.pageNotifications.mockResolvedValue(null);
    domain.countNotifications.mockResolvedValue(null);
    expect(renderToStaticMarkup(await Page(props()))).toContain("No notifications yet.");
  });
});
