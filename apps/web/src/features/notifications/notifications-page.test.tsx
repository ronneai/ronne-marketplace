import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import { NOTIFICATION_KINDS } from "@/server/domains/notifications/models/notification";
import type { NotificationView } from "@/server/domains/notifications/services/read";
import { englishLeaks, ownTextsShown } from "@/test/english-leak";
import { inLocale } from "@/test/intl";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ markRead: vi.fn(), markAllRead: vi.fn() }));
const { NotificationsPage } = await import("./NotificationsPage");
const { checkedNotificationsState, KIND_GROUPS, NOTIFICATIONS_LIST, notificationsQueryOf } =
  await import("./list");

const view = (id: string, extra: Partial<NotificationView> = {}): NotificationView => ({
  id,
  kind: "submission.changes_requested",
  params: { name: "@tools/lint", revision: 1 },
  actor: { id: "u1", name: "Bruno" },
  subject: { type: "submission", id: `s-${id}` },
  link: { to: "submission", id: `s-${id}` },
  createdAt: new Date("2026-10-31T12:00:00Z"),
  readAt: null,
  ...extra,
});

const state = (params: Record<string, string> = {}) =>
  checkedNotificationsState(parseListQuery(NOTIFICATIONS_LIST, params));
const render = (
  views: NotificationView[],
  params: Record<string, string> = {},
  locale: "en" | "pt" | "fr" = "en",
  node?: (el: ReactElement) => ReactElement,
) => {
  const el = (
    <NotificationsPage
      state={state(params)}
      views={views}
      page={{ next: null, previous: null }}
      total={{ count: views.length, capped: false }}
    />
  );
  return inLocale(locale, () => renderToStaticMarkup(node ? node(el) : el));
};

describe("the notifications list's state (139)", () => {
  it("reads a state and a kind from the address, newest first, and the person is not in it", () => {
    const s = state({ state: "unread", kind: "submission.rejected" });
    expect(s.sort).toBe("created");
    expect(s.dir).toBe("desc");
    expect(notificationsQueryOf(s)).toEqual({
      size: 25,
      cursor: undefined,
      state: "unread",
      kind: "submission.rejected",
    });
  });

  it("drops a state or kind it doesn't know", () => {
    const s = state({ state: "archived", kind: "submission.exploded" });
    expect(s.filters).toEqual({ state: "", kind: "" });
    expect(notificationsQueryOf(s)).toMatchObject({ state: undefined, kind: undefined });
    expect(parseListQuery(NOTIFICATIONS_LIST, { sort: "kind" }).sort).toBe("created");
  });

  it("groups every kind exactly once", () => {
    expect(KIND_GROUPS.flatMap((g) => g.kinds).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });
});

describe("the notifications page (139)", () => {
  it("lists each notification's sentence as a link, the unread ones marked, with the time", () => {
    const html = render([
      view("n1"),
      view("n2", { kind: "submission.approved", readAt: new Date("2026-10-31T12:05:00Z") }),
    ]);
    expect(html).toContain("Notifications");
    expect(html).toContain('<a class="text-fg');
    expect(html).toContain('href="/submissions/s-n1"');
    expect(html).toContain("Bruno requested changes to @tools/lint.");
    expect(html).toContain("Bruno approved @tools/lint.");
    expect(html).toContain("Unread");
    expect(html).toContain("2 notifications");
    expect(html).toContain("Mark selected as read");
    expect(html).toContain("Mark all as read");
  });

  it("shows a row whose subject is gone as plain text, never a link", () => {
    const html = render([view("n1", { link: null })]);
    expect(html).toContain("Bruno requested changes to @tools/lint.");
    expect(html).not.toContain('href="/submissions');
  });

  it("falls back to a plain line for a row it can't word, never a message key", () => {
    const html = render([view("n1", { kind: "membership.added", params: { workspace: "acme" } })]);
    expect(html).toContain("There is an update for you.");
    expect(html).not.toContain("notifications.membership");
  });

  it("offers the filters, with every kind under its group, and shows the chosen ones as chips", () => {
    const html = render([view("n1")], { state: "unread", kind: "submission.comment" });
    expect(html).toContain('name="state"');
    expect(html).toContain('<optgroup label="Your submissions">');
    for (const kind of NOTIFICATION_KINDS) expect(html).toContain(`value="${kind}"`);
    expect(html).toContain("Remove the status filter");
    expect(html).toContain("Remove the about filter");
  });

  it("says when there is nothing, and when the filters leave nothing", () => {
    expect(render([])).toContain("No notifications yet.");
    expect(render([], { state: "read" })).toContain("No notifications match these filters.");
  });

  it.each(["pt", "fr"] as const)(
    "%s: shows its own text, with no English left over",
    async (locale) => {
      const html = [
        render(
          [view("n1"), view("n2", { kind: "membership.removed", params: { workspace: "acme" } })],
          { state: "unread" },
          locale,
        ),
        render([], { kind: "submission.comment" }, locale),
        render([], {}, locale),
      ].join("\n");
      expect(await englishLeaks(["notifications", "common"], locale, html)).toEqual([]);
      expect(await ownTextsShown(["notifications"], locale, html)).toBeGreaterThan(5);
    },
  );
});
