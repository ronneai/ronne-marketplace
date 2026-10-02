import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainNav } from "@/components/app-shell/MainNav";
import type { QueueRow } from "@/server/domains/submissions/actions/reviews";

const reviews = vi.hoisted(() => ({
  listQueue: vi.fn(),
  countNeedsReview: vi.fn(),
  approveMany: vi.fn(),
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/reviews", () => reviews);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/reviews",
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { approvableRows, QueueTable, QueueTabs, queueTab } = await import("./QueueTable");
const { BulkApproveProvider, BulkApproveToolbar } = await import("./BulkApprove");
const { approveSelectedAction } = await import("./actions");
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
  proposal: null,
  stale: null,
  revision: 2,
  risky: true,
  riskKinds: ["hook"],
  mine: false,
  approvable: { approvable: true, override: false },
  ...overrides,
});

/** Needs review's table, with the selection approving many needs (054). */
const needs = (rows: QueueRow[]) =>
  renderToStaticMarkup(
    <BulkApproveProvider approvable={approvableRows(rows)}>
      <QueueTable tab="needs" rows={rows} nextCursor={null} />
    </BulkApproveProvider>,
  );

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
  it("marks change proposals, and stale ones", () => {
    const html = needs([
      row({
        proposal: { itemId: "i", baseVersionId: "v", baseVersion: "1.0.0", conflicts: [] },
        stale: "1.1.0",
      }),
    ]);
    expect(html).toContain(">change to 1.0.0<");
    expect(html).toContain(">stale<");
    expect(needs([row()])).not.toContain("change to");
  });

  it("reads the tab from the query, Needs review by default", () => {
    expect(queueTab(undefined)).toBe("needs");
    expect(queueTab("decided")).toBe("decided");
    expect(queueTab(["waiting"])).toBe("waiting");
    expect(queueTab("nope")).toBe("needs");
  });

  it("links each row to its review, with the author, revision, submit time and risk", () => {
    const html = needs([row()]);
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
    expect(needs([])).toContain("Nothing needs review.");
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

describe("approving several at once (054)", () => {
  const own = row({
    id: "01J0000000000000000000000B",
    name: "mine",
    mine: true,
    approvable: { approvable: false, reason: "Your own submission" },
  });

  it("lets only approvable rows be selected, with the reason on the others", () => {
    const html = needs([row(), own]);
    expect(html).toContain('aria-label="Select @team/fmt"');
    expect(html).toMatch(/aria-label="@team\/mine: Your own submission"[^>]*disabled=""/);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  });

  it("has no checkboxes on the other tabs", () => {
    const html = renderToStaticMarkup(
      <QueueTable tab="waiting" rows={[row({ status: "changes_requested" })]} nextCursor={null} />,
    );
    expect(html).not.toContain('type="checkbox"');
  });

  it("offers Select all and Approve selected only when something can be approved", () => {
    const some = renderToStaticMarkup(
      <BulkApproveProvider approvable={approvableRows([row(), own])}>
        <BulkApproveToolbar />
      </BulkApproveProvider>,
    );
    expect(some).toContain("Select all (1)");
    expect(some).toMatch(/disabled=""[^>]*>Approve selected \(0\)/);
    const none = renderToStaticMarkup(
      <BulkApproveProvider approvable={approvableRows([own])}>
        <BulkApproveToolbar />
      </BulkApproveProvider>,
    );
    expect(none).toBe("");
  });

  it("keeps what the dialog needs: risk kinds, the author, the revision and overrides", () => {
    expect(
      approvableRows([row({ approvable: { approvable: true, override: true }, mine: true })]),
    ).toEqual({
      "01J0000000000000000000000A": {
        name: "@team/fmt",
        type: "hook",
        author: "Ada Author",
        revision: 2,
        riskKinds: ["hook"],
        override: true,
      },
    });
  });

  it("approves through the domain and reports each result, or the error", async () => {
    const submission = { scope: { name: "team" }, name: "fmt" };
    reviews.approveMany.mockResolvedValue([
      { id: "a", result: "approved", submission, override: true, revision: 2 },
      { id: "b", result: "not_approvable", submission, reason: "It's withdrawn." },
      { id: "c", result: "not_found" },
    ]);
    expect(await approveSelectedAction(["a", "b", "c"], "Fine.")).toEqual({
      results: [
        {
          id: "a",
          name: "@team/fmt",
          result: "approved",
          override: true,
          revision: 2,
          reason: null,
        },
        {
          id: "b",
          name: "@team/fmt",
          result: "not_approvable",
          override: false,
          revision: null,
          reason: "It's withdrawn.",
        },
        {
          id: "c",
          name: "c",
          result: "not_found",
          override: false,
          revision: null,
          reason: "It no longer exists, or you can't see it.",
        },
      ],
    });
    expect(reviews.approveMany).toHaveBeenCalledWith(expect.any(Headers), {
      ids: ["a", "b", "c"],
      message: "Fine.",
    });
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
