import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainNav } from "@/components/app-shell/MainNav";
import type { QueueRow } from "@/server/domains/submissions/actions/reviews";

const reviews = vi.hoisted(() => ({
  listQueue: vi.fn(),
  countNeedsReview: vi.fn(),
  approveMany: vi.fn(),
  decide: vi.fn(),
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
const { BulkReleaseProvider } = await import("../releases/BulkRelease");
const { approveSelectedAction, decideAction } = await import("./actions");
const { default: ReviewsPage } = await import("@/app/(app)/reviews/page");
const { checkedQueueState, queueList, queueQueryOf } = await import("./list");
const { parseListQuery } = await import("@/components/ui/data-table/list-query");

/** QueueTable's props for a tab (062): its list, the default view, the rows and the next page. */
const tableProps = (
  tab: "needs" | "waiting" | "release" | "decided",
  rows: QueueRow[],
  next: string | null = null,
) => ({
  tab,
  list: queueList(tab),
  state: parseListQuery(queueList(tab), {}),
  rows,
  page: { next, previous: null },
  total: { count: rows.length, capped: false },
});

const row = (overrides: Partial<QueueRow> = {}): QueueRow => ({
  id: "01J0000000000000000000000A",
  authorId: "u1",
  authorName: "Ada Author",
  scope: { id: "s1", name: "team" },
  workspace: { id: "00000000000000000000000000", name: "global" },
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
  decisions: [],
  marks: [],
  approved: null,
  ...overrides,
});

/** Needs review's table, with the selection approving many needs (054). */
const needs = (rows: QueueRow[]) =>
  renderToStaticMarkup(
    <BulkApproveProvider approvable={approvableRows(rows)}>
      <QueueTable {...tableProps("needs", rows, null)} />
    </BulkApproveProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({
    id: "m",
    email: "m@x.test",
    name: "M",
    role: "user",
    workspaces: { global: "moderator" },
  });
  reviews.listQueue.mockResolvedValue({
    workspaces: [{ id: "00000000000000000000000000", name: "global" }],
    rows: [row()],
    next: null,
    previous: null,
    total: { count: 1, capped: false },
  });
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
    expect(queueTab("release")).toBe("release");
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
        {...tableProps("decided", [row({ status: "rejected", mine: true, risky: false })], "x|y")}
      />,
    );
    expect(decided).toContain(">yours<");
    expect(decided).toContain(">rejected<");
    expect(decided).toContain('href="/reviews?tab=decided&amp;cursor=x%7Cy"');
    expect(needs([])).toContain("Nothing needs review.");
  });

  it("ends Needs review and To release rows with their own decisions, not the other tabs (058)", () => {
    const decisions: QueueRow["decisions"] = [
      { decision: "approve", allowed: true },
      { decision: "request_changes", allowed: true },
      { decision: "reject", allowed: true },
    ];
    const html = needs([row({ decisions })]);
    expect(html).toContain('aria-label="Request changes: @team/fmt"');
    expect(html).toContain('aria-label="Reject: @team/fmt"');

    const released = row({
      status: "approved",
      decisions: [{ decision: "request_changes", allowed: true }],
    });
    const release = renderToStaticMarkup(
      <BulkReleaseProvider releasable={{ [released.id]: "@team/fmt" }}>
        <QueueTable {...tableProps("release", [released], null)} />
      </BulkReleaseProvider>,
    );
    expect(release).toContain('aria-label="Request changes: @team/fmt"');
    expect(release).not.toContain('aria-label="Reject');

    for (const tab of ["waiting", "decided"] as const)
      expect(
        renderToStaticMarkup(<QueueTable {...tableProps(tab, [row({ decisions })], null)} />),
      ).not.toContain("Request changes");
  });

  it("disables a reviewer's own row's decisions, with the reason (058)", () => {
    const reason = "Your own submission: another moderator or root decides.";
    const html = needs([
      row({
        mine: true,
        approvable: { approvable: false, reason: "Your own submission" },
        decisions: [
          { decision: "request_changes", allowed: false, reason },
          { decision: "reject", allowed: false, reason },
        ],
      }),
    ]);
    expect(html).toContain(reason);
    expect(
      html.match(
        /disabled=""[^>]*aria-label="(Request changes|Reject): @team\/fmt"|aria-label="(Request changes|Reject): @team\/fmt"[^>]*disabled=""/g,
      ),
    ).toHaveLength(2);
  });

  it("offers a Workspace filter when the reviewer moderates several, and sends it to the query (091)", () => {
    const one = renderToStaticMarkup(
      <QueueTable {...tableProps("decided", [row()], null)} workspaces={["acme"]} />,
    );
    expect(one).not.toContain('id="queue-workspace"');
    const several = renderToStaticMarkup(
      <QueueTable {...tableProps("decided", [row()], null)} workspaces={["acme", "beta"]} />,
    );
    expect(several).toContain('id="queue-workspace"');
    expect(several).toContain(">Every workspace you moderate</option>");
    const forRoot = renderToStaticMarkup(
      <QueueTable {...tableProps("decided", [row()], null)} workspaces={["acme", "beta"]} root />,
    );
    expect(forRoot).toContain(">Every workspace</option>");
    expect(several).toContain('<option value="beta">beta</option>');
    const list = queueList("needs");
    const state = checkedQueueState(parseListQuery(list, { workspace: "beta" }));
    expect(queueQueryOf("needs", state)).toMatchObject({ workspace: "beta" });
    expect(queueQueryOf("needs", parseListQuery(list, {}))).toMatchObject({
      workspace: undefined,
    });
  });

  it("marks the current tab", () => {
    const html = renderToStaticMarkup(<QueueTabs tab="waiting" />);
    expect(html).toMatch(/aria-current="page"[^>]*>Waiting on the author/);
  });

  it("is a 404 for anyone who can't review, and lists the tab for those who can", async () => {
    const html = renderToStaticMarkup(await ReviewsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Needs review");
    expect(reviews.listQueue).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ tab: "needs", sort: "time", dir: "asc", size: 50 }),
    );
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
      <QueueTable {...tableProps("waiting", [row({ status: "changes_requested" })], null)} />,
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
    const items = ["a", "b", "c"].map((id) => ({ id, revision: 2 }));
    expect(await approveSelectedAction(items, "Fine.")).toEqual({
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
      items,
      message: "Fine.",
    });
  });
});

describe("the To release tab (055)", () => {
  it("lists approved ones with a release checkbox, who approved them and when", () => {
    const html = renderToStaticMarkup(
      <BulkReleaseProvider releasable={{ "01J0000000000000000000000A": "@team/fmt" }}>
        <QueueTable
          {...tableProps(
            "release",
            [
              row({
                status: "approved",
                approved: { by: "Mo Moderator", at: new Date("2026-10-01T12:00:00Z") },
              }),
            ],
            null,
          )}
        />
      </BulkReleaseProvider>,
    );
    expect(html).toContain('aria-label="Select @team/fmt to release"');
    expect(html).toContain(">Approved by<");
    expect(html).toContain("Mo Moderator");
    expect(html).toContain("2026-10-01 12:00 UTC");
    expect(renderToStaticMarkup(<QueueTabs tab="release" />)).toMatch(
      /aria-current="page"[^>]*>To release/,
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

describe("the queue's table (062)", () => {
  it("keeps the tab in every link, sorts by name, and filters by search and type as chips", () => {
    const list = queueList("release");
    const state = checkedQueueState(
      parseListQuery(list, { tab: "release", q: "fmt", type: "hook" }),
    );
    const html = renderToStaticMarkup(
      <BulkReleaseProvider releasable={{}}>
        <QueueTable
          tab="release"
          list={list}
          state={state}
          rows={[row({ status: "approved" })]}
          page={{ next: "c2", previous: null }}
          total={{ count: 1, capped: false }}
        />
      </BulkReleaseProvider>,
    );
    expect(html).toContain('href="/reviews?tab=release&amp;q=fmt&amp;type=hook&amp;sort=name"');
    expect(html).toContain('href="/reviews?tab=release&amp;q=fmt&amp;type=hook&amp;cursor=c2"');
    expect(html).toContain('<input type="hidden" name="tab" value="release"/>');
    expect(html).toMatch(
      /aria-label="Remove the type filter"[^>]*href="\/reviews\?tab=release&amp;q=fmt"/,
    );
    expect(html).toContain('<span class="sr-only">Select</span>');
    expect(html).toContain('<span class="sr-only">Decisions</span>');
    expect(html).toContain("1 submission");
  });

  it("turns a tab's view into the server query, dropping an unknown type", () => {
    const list = queueList("decided");
    expect(
      queueQueryOf("decided", checkedQueueState(parseListQuery(list, { type: "widget" }))),
    ).toEqual({
      tab: "decided",
      sort: "time",
      dir: "desc",
      size: 50,
      cursor: undefined,
      search: undefined,
      type: undefined,
    });
  });
});

describe("decideAction (security audit AUTHZ-2)", () => {
  it("refuses an approval that doesn't say which revision was reviewed, and passes the one that does", async () => {
    reviews.decide.mockReset();
    reviews.decide.mockResolvedValue({});
    expect(await decideAction("s", "approve", "")).toEqual({
      error: "Reload the page: it doesn't say which revision you reviewed.",
    });
    expect(await decideAction("s", "override", "")).toMatchObject({ error: expect.any(String) });
    expect(reviews.decide).not.toHaveBeenCalled();
    expect(await decideAction("s", "approve", "", undefined, 2)).toEqual({ done: true });
    expect(reviews.decide).toHaveBeenCalledWith(expect.any(Headers), "s", {
      decision: "approve",
      message: "",
      revision: 2,
    });
    // A forged revision (not a whole number) is refused before the domain.
    reviews.decide.mockClear();
    expect(
      await decideAction("s", "approve", "", undefined, "2" as unknown as number),
    ).toMatchObject({
      error: expect.any(String),
    });
    expect(
      await approveSelectedAction(
        ["a"] as unknown as { id: string; revision: number | null }[],
        "",
      ),
    ).toMatchObject({ error: expect.any(String) });
    expect(reviews.decide).not.toHaveBeenCalled();
    // Requesting changes needs no revision.
    expect(await decideAction("s", "request_changes", "Why?")).toEqual({ done: true });
  });
});
