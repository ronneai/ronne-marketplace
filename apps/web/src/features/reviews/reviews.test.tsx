import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/app-shell/Sidebar";
import { listUrl } from "@/components/ui/data-table/list-query";
import type { QueueRow } from "@/server/domains/submissions/actions/reviews";
import { englishLeaks } from "@/test/english-leak";
import { inLocale, inLocaleAsync } from "@/test/intl";

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
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The page's current workspace (120): `shell.current` per test, the real rule for what's shown.
const shell = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("@/app/(app)/shell", async () => {
  const { fakeWorkspaceView } = await import("@/features/current-workspace/testing");
  return { workspaceView: fakeWorkspaceView(shell) };
});

const { approvableRows, QueueTable, QueueTabs, queueTab } = await import("./QueueTable");
const { ApproveForm, ApproveTitle, BulkApproveProvider, BulkApproveToolbar, ResultList } =
  await import("./BulkApprove");
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
  shell.current = null;
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

  it("has no Workspace filter of its own: the current workspace (120) is a fixed parameter", () => {
    const html = renderToStaticMarkup(<QueueTable {...tableProps("decided", [row()], null)} />);
    expect(html).not.toContain('id="queue-workspace"');
    expect(html).not.toContain("Why only these?");
    // The workspace shown goes to the query, and every link of the list keeps it, tab included.
    const list = queueList("waiting", { workspace: "beta" });
    const state = checkedQueueState(parseListQuery(list, { workspace: "beta", q: "fmt" }));
    expect(queueQueryOf("waiting", state, "beta")).toMatchObject({
      workspace: "beta",
      search: "fmt",
    });
    expect(queueQueryOf("waiting", state)).toMatchObject({ workspace: undefined });
    expect(listUrl(list, state, { sort: "name" })).toBe(
      "/reviews?tab=waiting&workspace=beta&q=fmt&sort=name",
    );
    // An explicit All while a current workspace is set stays in the links.
    expect(listUrl(queueList("needs", { workspace: "" }), state, {})).toBe(
      "/reviews?workspace=&q=fmt",
    );
  });

  it("keeps the workspace on the tabs' links", () => {
    const html = renderToStaticMarkup(<QueueTabs tab="needs" keep={{ workspace: "beta" }} />);
    expect(html).toContain('href="/reviews?workspace=beta"');
    expect(html).toContain('href="/reviews?tab=waiting&amp;workspace=beta"');
  });

  it("marks the current tab", () => {
    const html = renderToStaticMarkup(<QueueTabs tab="waiting" />);
    expect(html).toMatch(/aria-current="page"[^>]*>Waiting on the author/);
  });

  it("follows the current workspace (120): redirects to it, filters every tab, and says so", async () => {
    shell.current = "global";
    await expect(
      ReviewsPage({ searchParams: Promise.resolve({ tab: "waiting" }) }),
    ).rejects.toThrow("REDIRECT /reviews?tab=waiting&workspace=global");
    const html = renderToStaticMarkup(
      await ReviewsPage({ searchParams: Promise.resolve({ tab: "waiting", workspace: "global" }) }),
    );
    expect(reviews.listQueue).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ tab: "waiting", workspace: "global" }),
    );
    expect(html).toMatch(/Showing <strong[^>]*>global<\/strong> only/);
    expect(html).toContain('href="/reviews?workspace=global"');
    expect(html).toContain('href="/reviews?tab=release&amp;workspace=global"');
  });

  it("says when you don't review in the workspace shown (120), the same for private or unknown", async () => {
    const html = renderToStaticMarkup(
      await ReviewsPage({ searchParams: Promise.resolve({ workspace: "acme" }) }),
    );
    expect(html).toMatch(/You don’t review submissions in <strong[^>]*>acme<\/strong>/);
    expect(html).toContain("Show all");
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
    const submission = { workspace: { name: "global" }, scope: { name: "team" }, name: "fmt" };
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
    const items = [
      {
        href: "/reviews",
        key: "reviews" as const,
        group: "governance" as const,
        icon: "reviews" as const,
      },
    ];
    const sidebar = (count: number) =>
      renderToStaticMarkup(
        <Sidebar
          user={{ name: "M", email: "m@example.com", role: "user" }}
          items={items}
          counts={{ "/reviews": count }}
          workspaces={[]}
          propose={false}
          appearance={null}
        />,
      );
    expect(sidebar(3)).toMatch(
      /Reviews<\/span><span[^>]*><span[^>]*>3<span class="sr-only"> waiting/,
    );
    expect(sidebar(0)).not.toContain("waiting");
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

describe("the review queue in three languages (131)", () => {
  type L = "en" | "pt" | "fr";
  const html = (l: L, node: Parameters<typeof renderToStaticMarkup>[0]) =>
    inLocale(l, () => renderToStaticMarkup(node)).replace(/<!-- -->/g, "");
  const withoutHelp = (text: string) =>
    text
      .replace(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?<\/button>/g, "")
      .replace(/<noscript>.*?<\/noscript>/g, "");
  const listed = [
    {
      id: "a",
      name: "@t/{x}",
      type: "hook",
      author: "Ada",
      revision: 2,
      riskKinds: ["hook"],
      override: false,
    },
    {
      id: "b",
      name: "@t/b",
      type: "skill",
      author: "Mo",
      revision: null,
      riskKinds: [],
      override: true,
    },
  ];
  const form = (l: L, included: string[], overrides = true) =>
    html(
      l,
      <ApproveForm
        listed={overrides ? listed : listed.map((r) => ({ ...r, override: false }))}
        included={new Set(included)}
        filter=""
        text=""
        error={null}
        approving={false}
        onFilter={() => {}}
        onShown={() => {}}
        onToggle={() => {}}
        onText={() => {}}
        onCancel={() => {}}
        onSubmit={() => {}}
      />,
    );

  it("words the tabs, columns, badges and each tab's empty state", () => {
    expect(html("pt", <QueueTabs tab="needs" />)).toContain(">Precisa de revisão<");
    expect(html("fr", <QueueTabs tab="needs" />)).toContain(">En attente de l’auteur<");
    const needs = (l: L) =>
      html(
        l,
        <BulkApproveProvider approvable={approvableRows([row({ mine: true })])}>
          <QueueTable {...tableProps("needs", [row({ mine: true })])} />
        </BulkApproveProvider>,
      );
    expect(needs("pt")).toContain(">Autor<");
    expect(needs("pt")).toContain(">Submetida<");
    expect(needs("pt")).toContain(">⚠ risco<");
    expect(needs("pt")).toContain(">seu<");
    expect(needs("fr")).toContain('placeholder="Élément ou auteur"');
    expect(needs("fr")).toContain('aria-label="Sélectionner @team/fmt"');
    const empty = (l: L, tab: "needs" | "waiting" | "release" | "decided") =>
      html(l, <QueueTable {...tableProps(tab, [])} />);
    expect(empty("pt", "needs")).toContain("Nada precisa de revisão.");
    expect(empty("pt", "waiting")).toContain("Nenhuma submissão está aguardando o autor.");
    expect(empty("fr", "release")).toContain("Rien d’approuvé n’attend d’être publié.");
    expect(empty("fr", "decided")).toContain("Rien n’a encore été décidé.");
    const decided = html(
      "fr",
      <QueueTable {...tableProps("decided", [row({ status: "published" })])} />,
    );
    expect(decided).toContain(">Décidée<");
    expect(decided).toContain(">Statut<");
  });

  it("words the batch review: title, list, summary with 1 and 2 overrides, and buttons", () => {
    const title = (l: L, count: number) => html(l, <ApproveTitle count={count} done={false} />);
    expect(title("en", 1)).toContain("Approve 1 submission?");
    expect(title("pt", 1)).toContain("Aprovar 1 submissão?");
    expect(title("pt", 2)).toContain("Aprovar 2 submissões?");
    expect(title("fr", 2)).toContain("Approuver 2 soumissions?");
    expect(title("fr", 1)).toContain(">Révision par lot<");
    expect(html("pt", <ApproveTitle count={2} done />)).toBe("Aprovadas");
    const one = form("en", ["a", "b"]);
    expect(one).toContain(
      "2 submissions selected</strong>: one is your own, approved as an override",
    );
    expect(form("pt", ["a"], false)).toContain("1 submissão selecionada</strong>.");
    expect(form("pt", ["a", "b"])).toContain("2 submissões selecionadas</strong>: uma é sua");
    expect(form("fr", ["b"])).toContain("1 soumission sélectionnée</strong> : une est la vôtre");
    const both = listed.map((r) => ({ ...r, override: true }));
    expect(
      html(
        "fr",
        <ApproveForm
          listed={both}
          included={new Set(["a", "b"])}
          filter=""
          text=""
          error={null}
          approving={false}
          onFilter={() => {}}
          onShown={() => {}}
          onToggle={() => {}}
          onText={() => {}}
          onCancel={() => {}}
          onSubmit={() => {}}
        />,
      ),
    ).toContain(" : 2 sont les vôtres, approuvées par dérogation");
    expect(form("pt", ["a"])).toContain("Ada · revisão 2");
    expect(form("pt", ["a"])).toContain('aria-label="Incluir @t/{x}"');
    expect(form("pt", ["a", "b"])).toContain(">Aprovar 2 submissões<");
    expect(form("fr", ["a"])).toContain(">Approuver 1 soumission<");
    expect(form("fr", ["a"])).toContain(">dérogation<");
    expect(form("fr", ["a"])).toContain("Une note pour chaque approbation");
  });

  it("counts the selection and words the summary as one sentence, with 0, 1 and 2", () => {
    const rows = (n: number, overrides: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `@t/${i}`,
        type: "hook",
        author: "Ada",
        revision: 1,
        riskKinds: [],
        id: `r${i}`,
        override: i < overrides,
      }));
    const at = (l: L, n: number, overrides: number) => {
      const all = rows(n, overrides);
      return html(
        l,
        <ApproveForm
          listed={all.length > 0 ? all : rows(1, 0)}
          included={new Set(all.map((r) => r.id))}
          filter=""
          text=""
          error={null}
          approving={false}
          onFilter={() => {}}
          onShown={() => {}}
          onToggle={() => {}}
          onText={() => {}}
          onCancel={() => {}}
          onSubmit={() => {}}
        />,
      );
    };
    const selected = (l: L, n: number) => at(l, n, 0).match(/\/>(\d+ [^<]+)<\/label>/)?.[1];
    expect([0, 1, 2].map((n) => selected("en", n))).toEqual([
      "0 selected",
      "1 selected",
      "2 selected",
    ]);
    expect([0, 1, 2].map((n) => selected("pt", n))).toEqual([
      "0 selecionada",
      "1 selecionada",
      "2 selecionadas",
    ]);
    expect([0, 1, 2].map((n) => selected("fr", n))).toEqual([
      "0 sélectionnée",
      "1 sélectionnée",
      "2 sélectionnées",
    ]);
    const summary = (l: L, n: number, o: number) =>
      at(l, n, o).match(/<strong class="font-semibold text-fg">[^<]*<\/strong>[^<]*/)?.[0];
    expect(summary("en", 2, 0)).toBe(
      '<strong class="font-semibold text-fg">2 submissions selected</strong>.',
    );
    expect(summary("pt", 1, 0)).toBe(
      '<strong class="font-semibold text-fg">1 submissão selecionada</strong>.',
    );
    expect(summary("pt", 2, 1)).toContain("</strong>: uma é sua, aprovada como exceção");
    expect(summary("pt", 2, 2)).toContain("</strong>: 2 são suas, aprovadas como exceções");
    expect(summary("fr", 1, 1)).toContain("1 soumission sélectionnée</strong> : une est la vôtre");
    expect(summary("fr", 2, 2)).toContain(
      "</strong> : 2 sont les vôtres, approuvées par dérogation",
    );
    expect(summary("en", 2, 2)).toContain("</strong>: 2 are your own, approved as overrides");
  });

  it("words what approving did to each", () => {
    const results = (l: L) =>
      html(
        l,
        <ResultList
          results={
            [
              {
                id: "a",
                name: "@t/a",
                result: "approved",
                override: false,
                revision: 2,
                reason: null,
              },
              {
                id: "b",
                name: "@t/b",
                result: "approved",
                override: true,
                revision: 1,
                reason: null,
              },
              {
                id: "c",
                name: "@t/c",
                result: "not_approved",
                override: false,
                revision: null,
                reason: "Gone.",
              },
            ] as never
          }
        />,
      );
    expect(results("pt")).toContain(">Aprovada:<");
    expect(results("pt")).toContain(">Aprovada (exceção):<");
    expect(results("pt")).toContain(">Não aprovada:<");
    expect(results("fr")).toContain(">révision 2<");
  });

  it("titles and heads the page in the language", async () => {
    const { generateMetadata } = await import("@/app/(app)/reviews/page");
    expect(await inLocaleAsync("pt", () => generateMetadata())).toEqual({
      title: "Revisões · Ronne AI Marketplace",
    });
    const page = await inLocaleAsync("fr", async () =>
      renderToStaticMarkup(await ReviewsPage({ searchParams: Promise.resolve({}) })),
    );
    expect(page).toContain(">Révisions<");
    expect(page).toContain("La révision fait office de contrôle");
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left on the queue and the batch review`, async () => {
      const all = withoutHelp(
        [
          html(locale, <QueueTabs tab="release" />),
          html(
            locale,
            <BulkApproveProvider approvable={approvableRows([row({ mine: true })])}>
              <BulkApproveToolbar />
              <QueueTable {...tableProps("needs", [row({ mine: true })])} />
            </BulkApproveProvider>,
          ),
          html(locale, <QueueTable {...tableProps("waiting", [])} />),
          form(locale, ["a", "b"]),
          html(locale, <ApproveTitle count={2} done={false} />),
        ].join("\n"),
      );
      expect(await englishLeaks(["author", "common"], locale, all)).toEqual([]);
    });
  }
});
