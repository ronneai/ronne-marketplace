import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ unreadCount: vi.fn(), latestNotifications: vi.fn() }));
vi.mock("@/server/domains/notifications/actions/notifications", () => actions);
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const count = await import("./count/route");
const latest = await import("./latest/route");

const call = (handler: (request: Request, context: undefined) => Promise<Response>) =>
  handler(new Request("http://localhost/notifications"), undefined);

beforeEach(() => vi.clearAllMocks());

describe("the notification routes (139)", () => {
  it("the count: the signed-in person's number, never cached", async () => {
    actions.unreadCount.mockResolvedValue(4);
    const response = await call(count.GET);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 4 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("the latest: the ten and the count, never cached", async () => {
    actions.latestNotifications.mockResolvedValue({ unread: 1, items: [{ id: "n" }] });
    const response = await call(latest.GET);
    expect(await response.json()).toEqual({ unread: 1, items: [{ id: "n" }] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answer a signed-out request with 401 and no data", async () => {
    actions.unreadCount.mockResolvedValue(null);
    actions.latestNotifications.mockResolvedValue(null);
    for (const handler of [count.GET, latest.GET]) {
      const response = await call(handler);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.stringify(await response.json())).not.toContain("count");
    }
  });
});
