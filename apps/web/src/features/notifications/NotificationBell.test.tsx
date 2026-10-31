// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigation = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));
const actions = vi.hoisted(() => ({ markRead: vi.fn(), markAllRead: vi.fn() }));
vi.mock("./actions", () => actions);

const { NotificationBell } = await import("./NotificationBell");
const { POLL_MS } = await import("./use-unread-count");

let root: Root;
let host: HTMLElement;
const fetchMock = vi.fn();

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: "submission.changes_requested",
  params: { name: "@tools/lint", revision: 1 },
  actor: { id: "u1", name: "Bruno" },
  subject: { type: "submission", id: `s-${id}` },
  link: { to: "submission", id: `s-${id}` },
  createdAt: "2026-10-31T12:00:00.000Z",
  readAt: null,
  ...over,
});

const answer = (body: unknown, ok = true) => {
  fetchMock.mockResolvedValueOnce({ ok, json: async () => body });
};

const mount = async (initialCount: number) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<NotificationBell initialCount={initialCount} />));
};
const bell = () => host.querySelector("button") as HTMLButtonElement;
const badge = () => host.querySelector("button span[aria-hidden]")?.textContent ?? null;
const setHidden = async (hidden: boolean) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  navigation.path = "/";
  fetchMock.mockReset();
  actions.markRead.mockReset();
  actions.markAllRead.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the bell's badge (139)", () => {
  it("shows the count, '99+' past ninety-nine, and nothing at zero; its name says the count", async () => {
    await mount(3);
    expect(badge()).toBe("3");
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 3 unread");
    await act(async () => root.unmount());
    host.remove();
    await mount(150);
    expect(badge()).toBe("99+");
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 150 unread");
    await act(async () => root.unmount());
    host.remove();
    await mount(0);
    expect(badge()).toBeNull();
    expect(bell().getAttribute("aria-label")).toBe("Notifications, none unread");
  });
});

describe("the count's refresh (139)", () => {
  it("asks every minute while the page is visible, and takes the new number", async () => {
    await mount(2);
    answer({ count: 5 });
    await tick(POLL_MS);
    expect(fetchMock).toHaveBeenCalledWith(
      "/notifications/count",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(badge()).toBe("5");
    answer({ count: 6 });
    await tick(POLL_MS);
    expect(badge()).toBe("6");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("doesn't ask while the page is hidden, and asks at once when it is visible again", async () => {
    await mount(2);
    await setHidden(true);
    await tick(POLL_MS * 3);
    expect(fetchMock).not.toHaveBeenCalled();
    answer({ count: 9 });
    await setHidden(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(badge()).toBe("9");
  });

  it("keeps the number when a request fails or says no", async () => {
    await mount(4);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await tick(POLL_MS);
    answer({ error: "nope" }, false);
    await tick(POLL_MS);
    expect(badge()).toBe("4");
  });

  it("asks again on a change of page, but not for the first render", async () => {
    await mount(1);
    expect(fetchMock).not.toHaveBeenCalled();
    navigation.path = "/catalogue";
    answer({ count: 0 });
    await act(async () => root.render(<NotificationBell initialCount={1} />));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(badge()).toBeNull();
  });

  it("stops asking once it is gone", async () => {
    await mount(1);
    await act(async () => root.unmount());
    host.remove();
    await tick(POLL_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
});

describe("the popover (139)", () => {
  const open = async (body: unknown) => {
    answer(body);
    await act(async () => bell().click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  };
  const panel = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

  it("loads the latest when it opens, and words each in English, the unread ones marked", async () => {
    await mount(2);
    await open({
      unread: 2,
      items: [
        item("n1"),
        item("n2", { kind: "submission.approved", readAt: "2026-10-31T12:05:00.000Z" }),
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/notifications/latest",
      expect.objectContaining({ cache: "no-store" }),
    );
    const text = panel()?.textContent ?? "";
    expect(text).toContain("Notifications");
    expect(text).toContain("2 unread");
    expect(text).toContain("Bruno requested changes to @tools/lint.");
    expect(text).toContain("Bruno approved @tools/lint.");
    expect(text).toContain("See all notifications");
    // Only the unread row carries the dot.
    expect(panel()?.querySelectorAll('[aria-label="Unread"]')).toHaveLength(1);
    // A row is one link, to the submission.
    expect(panel()?.querySelector('a[href="/submissions/s-n1"]')).not.toBeNull();
    expect(panel()?.querySelector('a[href="/notifications"]')).not.toBeNull();
  });

  it("says when there is nothing, and when it can't load, and tries again", async () => {
    await mount(0);
    await open({ unread: 0, items: [] });
    expect(panel()?.textContent).toContain("You’re all caught up.");
    await act(async () => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    await mount(0);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => bell().click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(panel()?.textContent).toContain("Couldn’t load notifications.");
    answer({ unread: 1, items: [item("n1")] });
    const retry = [...(panel()?.querySelectorAll("button") ?? [])].find((b) =>
      b.textContent?.includes("Try again"),
    ) as HTMLButtonElement;
    await act(async () => retry.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(panel()?.textContent).toContain("Bruno requested changes");
  });

  it("marks everything read, and the badge follows", async () => {
    await mount(2);
    await open({ unread: 2, items: [item("n1"), item("n2")] });
    actions.markAllRead.mockResolvedValue({ unread: 0 });
    const markAll = [...(panel()?.querySelectorAll("button") ?? [])].find((b) =>
      b.textContent?.includes("Mark all as read"),
    ) as HTMLButtonElement;
    expect(markAll.disabled).toBe(false);
    await act(async () => markAll.click());
    expect(actions.markAllRead).toHaveBeenCalledTimes(1);
    expect(badge()).toBeNull();
    expect(panel()?.querySelectorAll('[aria-label="Unread"]')).toHaveLength(0);
    expect(markAll.disabled).toBe(true);
  });

  it("marks one read when its link is opened, and the badge follows", async () => {
    await mount(2);
    await open({ unread: 2, items: [item("n1"), item("n2")] });
    actions.markRead.mockResolvedValue({ unread: 1 });
    const link = panel()?.querySelector('a[href="/submissions/s-n1"]') as HTMLAnchorElement;
    link.addEventListener("click", (event) => event.preventDefault());
    await act(async () => link.click());
    expect(actions.markRead).toHaveBeenCalledWith(["n1"]);
    expect(badge()).toBe("1");
  });

  it("shows a row without a link as plain text, never a link", async () => {
    await mount(1);
    await open({ unread: 1, items: [item("n1", { link: null })] });
    expect(panel()?.textContent).toContain("Bruno requested changes");
    expect(panel()?.querySelector('a[href^="/submissions"]')).toBeNull();
  });

  it("falls back to a plain line for a row it can't word, never a message key", async () => {
    await mount(1);
    await open({
      unread: 1,
      items: [item("n1", { kind: "membership.added", params: { workspace: "acme" } })],
    });
    const text = panel()?.textContent ?? "";
    expect(text).toContain("There is an update for you.");
    expect(text).not.toContain("membership.added");
  });
});
