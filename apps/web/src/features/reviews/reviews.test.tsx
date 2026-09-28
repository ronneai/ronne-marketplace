import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainNav } from "@/components/app-shell/MainNav";
import type { QueueRow } from "@/server/domains/submissions/actions/reviews";

const reviews = vi.hoisted(() => ({ listQueue: vi.fn(), countNeedsReview: vi.fn() }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/reviews", () => reviews);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/reviews",
}));

const { QueueTable, QueueTabs, queueTab } = await import("./QueueTable");
const { default: ReviewsPage } = await import("@/app/(app)/reviews/page");

const row = (overrides: Partial<QueueRow> = {}): QueueRow => ({
  id: "01J0000000000000000000000A",
  authorId: "u1",
  authorName: "Ada Author",
  scope: { id: "s1", name: "team" },
  name: "fmt",
  type: "hook",
  status: "submitted",
  createdAt: new Date("2026-09-28T09:00:00Z"),
  updatedAt: new Date("2026-09-28T10:00:00Z"),
  submittedAt: new Date("2026-09-28T09:30:00Z"),
  revision: 2,
  risky: true,
  mine: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({
    id: "m",
    email: "m@x.test",
    name: "M",
    role: "moderator",
  });
  reviews.listQueue.mockResolvedValue({ rows: [row()], nextCursor: null });
});

describe("the queue", () => {
  it("reads the tab from the query, Needs review by default", () => {
    expect(queueTab(undefined)).toBe("needs");
    expect(queueTab("decided")).toBe("decided");
    expect(queueTab(["waiting"])).toBe("waiting");
    expect(queueTab("nope")).toBe("needs");
  });

  it("links each row to its review, with the author, revision, submit time and risk", () => {
    const html = renderToStaticMarkup(<QueueTable tab="needs" rows={[row()]} nextCursor={null} />);
    expect(html).toContain('href="/reviews/01J0000000000000000000000A"');
    expect(html).toContain("@team/fmt");
    expect(html).toContain("Ada Author");
    expect(html).toContain("2026-09-28 09:30 UTC");
    expect(html).toContain("⚠ risk");
    expect(html).not.toContain(">yours<");
  });

  it("marks the reviewer's own, shows statuses and paging on Decided, and says when a tab is empty", () => {
    const decided = renderToStaticMarkup(
      <QueueTable
        tab="decided"
        rows={[row({ status: "rejected", mine: true, risky: false })]}
        nextCursor="x|y"
      />,
    );
    expect(decided).toContain(">yours<");
    expect(decided).toContain(">rejected<");
    expect(decided).toContain("Older decisions");
    expect(renderToStaticMarkup(<QueueTable tab="needs" rows={[]} nextCursor={null} />)).toContain(
      "Nothing needs review.",
    );
  });

  it("marks the current tab", () => {
    const html = renderToStaticMarkup(<QueueTabs tab="waiting" />);
    expect(html).toMatch(/aria-current="page"[^>]*>Waiting on the author/);
  });

  it("is a 404 for anyone who can't review, and lists the tab for those who can", async () => {
    const html = renderToStaticMarkup(await ReviewsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Needs review");
    expect(reviews.listQueue).toHaveBeenCalledWith(expect.any(Headers), {
      tab: "needs",
      cursor: undefined,
    });
    session.getCurrentUser.mockResolvedValue({
      id: "u",
      email: "u@x.test",
      name: "U",
      role: "user",
    });
    await expect(ReviewsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("the nav count", () => {
  it("shows a count next to an item, and nothing for zero", () => {
    const items = [{ href: "/reviews", label: "Reviews" }];
    expect(renderToStaticMarkup(<MainNav items={items} counts={{ "/reviews": 3 }} />)).toMatch(
      /Reviews<span[^>]*>3<span class="sr-only"> waiting/,
    );
    expect(
      renderToStaticMarkup(<MainNav items={items} counts={{ "/reviews": 0 }} />),
    ).not.toContain("waiting");
  });
});
