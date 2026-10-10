import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { DraftScopeNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import type { Submission } from "@/server/domains/submissions/models/submission";

const drafts = vi.hoisted(() => ({
  createDraft: vi.fn(),
  listMySubmissions: vi.fn(),
  pageMySubmissions: vi.fn(),
  countMySubmissionsByStatus: vi.fn(),
}));
const scopes = vi.hoisted(() => ({ listScopes: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const bulk = vi.hoisted(() => ({
  checkManyDrafts: vi.fn(),
  submitManyDrafts: vi.fn(),
  dependencyMarks: vi.fn(async () => ({})),
  canDeleteSubmission: vi.fn(async () => true),
  latestFeedback: vi.fn(async () => ({})),
}));
vi.mock("@/server/domains/submissions/actions/drafts", () => drafts);
vi.mock("@/server/domains/submissions/actions/submissions", () => bulk);
const publish = vi.hoisted(() => ({ prepareRelease: vi.fn(), releaseMany: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/publish", () => publish);
vi.mock("@/server/domains/items/actions/scopes", () => scopes);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

const actions = await import("./actions");
const { NoSubmissions, StatusFilters, SubmissionsTable, shortened } = await import(
  "./SubmissionsTable"
);
const { checkedSubmissionsState, SUBMISSIONS_LIST, submissionsQueryOf } = await import("./list");
const { parseListQuery } = await import("@/components/ui/data-table/list-query");

/** A view of the list, from a query string (063). */
const view = (params: Record<string, string> = {}) =>
  checkedSubmissionsState(parseListQuery(SUBMISSIONS_LIST, params));
/** SubmissionsTable's view props: the default view, one page. */
const table = (params: Record<string, string> = {}) => ({
  state: view(params),
  page: { next: null, previous: null },
  total: { count: 1, capped: false },
});
/** The server's answers for a person with these submissions: the page by status, the counts. */
const mockList = (list: Submission[]) => {
  drafts.listMySubmissions.mockResolvedValue(list);
  drafts.pageMySubmissions.mockImplementation(async (_headers, query: { status?: string }) => {
    const rows = list.filter((s) =>
      query.status ? s.status === query.status : s.status !== "withdrawn",
    );
    return { rows, next: null, previous: null, total: { count: rows.length, capped: false } };
  });
  drafts.countMySubmissionsByStatus.mockResolvedValue(
    list.reduce<Record<string, number>>((counts, s) => {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
      return counts;
    }, {}),
  );
};
const { NewDraftForm } = await import("./NewDraftForm");
const { BulkResults, BulkSubmitProvider, BulkToolbar, neededBy, toggled } = await import(
  "./BulkSubmit"
);
const { BulkReleaseProvider, BulkReleaseToolbar } = await import("../releases/BulkRelease");
const releases = await import("../releases/actions");
const { default: SubmissionsPage } = await import("@/app/(app)/submissions/page");
const { default: NewItemPage } = await import("@/app/(app)/submissions/new/page");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const submission = (overrides: Partial<Submission> = {}): Submission => ({
  id: "01J0000000000000000000000A",
  authorId: "u1",
  scope: { id: "s1", name: "platform" },
  workspace: { id: "00000000000000000000000000", name: "global" },
  name: "code-reviewer",
  type: "agent",
  status: "draft",
  createdAt: new Date("2026-09-27T10:00:00Z"),
  updatedAt: new Date("2026-09-27T14:05:00Z"),
  submittedAt: null,
  proposal: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockList([submission()]);
  bulk.checkManyDrafts.mockResolvedValue({ drafts: [], more: 0 });
  scopes.listScopes.mockResolvedValue({
    scopes: [{ name: "platform", description: "Shared tools." }],
    nextCursor: null,
  });
});

describe("createDraftFromForm", () => {
  it("creates the draft and opens it in the editor", async () => {
    drafts.createDraft.mockResolvedValue({ id: "01J0000000000000000000000B" });
    await expect(
      actions.createDraftFromForm({}, form({ scope: "platform", name: "critic", type: "agent" })),
    ).rejects.toThrow("NEXT_REDIRECT /submissions/01J0000000000000000000000B");
    expect(drafts.createDraft).toHaveBeenCalledWith(expect.any(Headers), {
      scope: "platform",
      name: "critic",
      type: "agent",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/submissions");
  });

  it("turns domain and permission errors into the form's message", async () => {
    drafts.createDraft.mockRejectedValueOnce(new DraftScopeNotFoundError("gone"));
    expect(await actions.createDraftFromForm({}, form({ scope: "gone" }))).toEqual({
      error: "There's no scope @gone you can use. Root and a workspace's admins create scopes.",
    });
    drafts.createDraft.mockRejectedValueOnce(new ForbiddenError("submissions.create"));
    expect((await actions.createDraftFromForm({}, form({}))).error).toBeTruthy();
    drafts.createDraft.mockRejectedValueOnce(new Error("database down"));
    await expect(actions.createDraftFromForm({}, form({}))).rejects.toThrow("database down");
  });
});

describe("SubmissionsTable", () => {
  it("marks change proposals, and stale ones", () => {
    const html = renderToStaticMarkup(
      <SubmissionsTable
        {...table()}
        submissions={[
          {
            ...submission(),
            proposal: { itemId: "i", baseVersionId: "v", baseVersion: "1.0.0", conflicts: [] },
            stale: "1.1.0",
          },
        ]}
      />,
    );
    expect(html).toContain(">change to 1.0.0<");
    expect(html).toContain(">stale<");
  });

  it("links each draft to its editor, with its type, status and last change", () => {
    const html = renderToStaticMarkup(
      <SubmissionsTable {...table()} submissions={[submission()]} />,
    );
    expect(html).toContain('href="/submissions/01J0000000000000000000000A"');
    expect(html).toContain("@platform/code-reviewer");
    expect(html).toContain(">agent<");
    expect(html).toContain(">draft<");
    expect(html).toContain("2026-09-27 14:05 UTC");
  });

  it("explains drafts when there are none, and offers a new item", () => {
    const html = renderToStaticMarkup(<NoSubmissions />);
    expect(html).toContain("You have no drafts yet.");
    expect(html).toContain('href="/submissions/new"');
  });
});

describe("selecting dependency drafts with what needs them (056)", () => {
  const ready = new Map([
    ["kit", "@t/kit"],
    ["style", "@t/style"],
    ["tabs", "@t/tabs"],
  ]);
  const needs = { kit: ["style", "notes"], style: ["tabs"] };

  it("selects the ready drafts a draft needs, depth first, and keeps them while it's selected", () => {
    const withKit = toggled(new Set(), "kit", ready, needs);
    // notes isn't ready, so it isn't selected (the check said kit waits for it).
    expect([...withKit]).toEqual(["kit", "style", "tabs"]);
    expect(neededBy("style", withKit, needs, ready)).toBe("@t/kit");
    expect([...toggled(withKit, "style", ready, needs)]).toEqual(["kit", "style", "tabs"]);
    const withoutKit = toggled(withKit, "kit", ready, needs);
    expect([...withoutKit]).toEqual(["style", "tabs"]);
    expect([...toggled(toggled(withoutKit, "style", ready, needs), "tabs", ready, needs)]).toEqual(
      [],
    );
  });
});

describe("submitting several at once (052)", () => {
  const ready = submission({ id: "01J0000000000000000000000A", name: "ready-one" });
  const blocked = submission({ id: "01J0000000000000000000000B", name: "blocked-one" });
  const inReview = submission({ id: "01J0000000000000000000000C", status: "submitted" });
  const issue = { severity: "error" as const, code: "schema", message: "description is required." };

  it("marks each open draft Ready or n to fix, and lets only ready ones be selected", () => {
    const html = renderToStaticMarkup(
      <BulkSubmitProvider ready={{ [ready.id]: "@platform/ready-one" }}>
        <SubmissionsTable
          {...table()}
          submissions={[ready, blocked, inReview]}
          errors={{ [ready.id]: 0, [blocked.id]: 2 }}
        />
      </BulkSubmitProvider>,
    );
    expect(html).toContain('aria-label="Select @platform/ready-one"');
    expect(html).toMatch(
      /aria-label="Fix 2 issues in @platform\/blocked-one first"[^>]*disabled=""/,
    );
    expect(html).toContain(">Ready<");
    expect(html).toContain(`href="/submissions/${blocked.id}">2 to fix<`);
    // A submission in review has no checkbox and no mark.
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  });

  it("offers Select all ready and Submit selected only when something is ready", () => {
    const some = renderToStaticMarkup(
      <BulkSubmitProvider ready={{ [ready.id]: "@platform/ready-one" }}>
        <BulkToolbar />
      </BulkSubmitProvider>,
    );
    expect(some).toContain("Select all ready (1)");
    expect(some).toMatch(/disabled=""[^>]*>Submit selected \(0\)/);
    const none = renderToStaticMarkup(
      <BulkSubmitProvider ready={{}}>
        <BulkToolbar />
      </BulkSubmitProvider>,
    );
    expect(none).toBe("");
  });

  it("marks the page's drafts from one check", async () => {
    mockList([ready, blocked]);
    bulk.checkManyDrafts.mockResolvedValue({
      drafts: [
        { id: ready.id, result: "ready", submission: ready, issues: [] },
        { id: blocked.id, result: "not_ready", submission: blocked, issues: [issue] },
      ],
      more: 0,
    });
    const html = renderToStaticMarkup(await SubmissionsPage({ searchParams: Promise.resolve({}) }));
    expect(bulk.checkManyDrafts).toHaveBeenCalledWith(expect.any(Headers), { all: true });
    expect(html).toContain("Select all ready (1)");
    expect(html).toContain("1 to fix");
  });

  it("submits the selection and says what happened to each", async () => {
    bulk.submitManyDrafts.mockResolvedValue({
      results: [
        { id: ready.id, result: "submitted", submission: ready, revision: 1, issues: [] },
        { id: blocked.id, result: "not_ready", submission: blocked, issues: [issue] },
        { id: "gone", result: "not_found" },
      ],
      more: 0,
    });
    expect(await actions.submitSelectedAction([ready.id, blocked.id, "gone"])).toEqual([
      { id: ready.id, name: "@platform/ready-one", result: "submitted", reasons: [] },
      {
        id: blocked.id,
        name: "@platform/blocked-one",
        result: "not_ready",
        reasons: ["description is required."],
      },
      {
        id: "gone",
        name: "gone",
        result: "not_found",
        reasons: ["It's no longer one of your drafts."],
      },
    ]);
    expect(bulk.submitManyDrafts).toHaveBeenCalledWith(expect.any(Headers), {
      ids: [ready.id, blocked.id, "gone"],
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/submissions");
  });
});

describe("a draft in a workspace they aren't in (091, 094)", () => {
  it("says why it wasn't submitted, and links to Ask to join the workspace", async () => {
    const base = submission({ id: "01J0000000000000000000000C", name: "away-one" });
    const away = { ...base, workspace: { ...base.workspace, name: "acme" } };
    bulk.submitManyDrafts.mockResolvedValue({
      results: [
        {
          id: away.id,
          result: "not_a_member",
          submission: away,
          issues: [{ severity: "error", code: "not_a_member", message: "You aren't a member." }],
        },
      ],
      more: 0,
    });
    const results = await actions.submitSelectedAction([away.id]);
    expect(results).toEqual([
      {
        id: away.id,
        name: "@platform/away-one",
        result: "not_a_member",
        reasons: ["You aren't a member."],
        joinWorkspace: "acme",
      },
    ]);
    const html = renderToStaticMarkup(<BulkResults results={results} />);
    expect(html).toContain("You aren&#x27;t a member.");
    expect(html).toMatch(/<a [^>]*href="\/workspaces\/acme\/join"[^>]*>Ask to join acme<\/a>/);
  });
});

describe("status filters and order", () => {
  const list = [
    submission({ id: "a", status: "withdrawn", updatedAt: new Date("2026-09-28T10:00:00Z") }),
    submission({ id: "b", status: "draft", updatedAt: new Date("2026-09-26T10:00:00Z") }),
    submission({ id: "c", status: "submitted", updatedAt: new Date("2026-09-27T10:00:00Z") }),
  ];

  const counts = { withdrawn: 1, draft: 1, submitted: 1 };

  it("offers All and each status you have, with counts, Archived last and out of All (057)", () => {
    const html = renderToStaticMarkup(
      <StatusFilters counts={counts} state={view({ status: "submitted" })} />,
    );
    expect(html).toContain("All (2)");
    expect(html).toContain('href="/submissions?status=withdrawn"');
    expect(html).toMatch(/archived \(1\)<\/a><\/nav>/);
    expect(html).not.toContain("status=approved");
    expect(html).toMatch(/aria-current="page"[^>]*>submitted \(1\)/);
  });

  it("shows the Archived filter even when everything else is one status", () => {
    const html = renderToStaticMarkup(<StatusFilters counts={{ withdrawn: 1 }} state={view()} />);
    expect(html).toContain("All (0)");
    expect(html).toContain("archived (1)");
  });

  it("reads only real statuses and types from the query, into the server query (063)", () => {
    expect(view({ status: "changes_requested" }).filters.status).toBe("changes_requested");
    expect(view({ status: ["draft", "x"] as unknown as string }).filters.status).toBe("draft");
    expect(view({ status: "nope", type: "widget" }).filters).toMatchObject({
      status: "",
      type: "",
    });
    expect(submissionsQueryOf(view({ status: "draft", q: "rev", sort: "name" }))).toEqual({
      sort: "name",
      dir: "asc",
      size: 50,
      cursor: undefined,
      status: "draft",
      search: "rev",
      type: undefined,
    });
  });

  it("keeps the sort and size in the status links, dropping the search and the cursor", () => {
    const html = renderToStaticMarkup(
      <StatusFilters
        counts={counts}
        state={view({ sort: "name", size: "25", q: "x", cursor: "c1" })}
      />,
    );
    expect(html).toContain('href="/submissions?status=draft&amp;sort=name&amp;size=25"');
    expect(html).toContain('href="/submissions?sort=name&amp;size=25"');
  });

  it("filters the page by ?status=", async () => {
    mockList(list);
    const html = renderToStaticMarkup(
      await SubmissionsPage({ searchParams: Promise.resolve({ status: "draft" }) }),
    );
    expect(html).toContain('href="/submissions/b"');
    expect(html).not.toContain('href="/submissions/c"');
  });

  it("hides archived ones from All, and lists them under Archived with Restore and Delete (057)", async () => {
    mockList(list);
    const all = renderToStaticMarkup(await SubmissionsPage({ searchParams: Promise.resolve({}) }));
    expect(all).toContain('href="/submissions/b"');
    expect(all).not.toContain('href="/submissions/a"');
    expect(all).not.toContain(">Restore<");

    bulk.canDeleteSubmission.mockResolvedValueOnce(false);
    const archived = renderToStaticMarkup(
      await SubmissionsPage({ searchParams: Promise.resolve({ status: "withdrawn" }) }),
    );
    expect(archived).toContain('href="/submissions/a"');
    expect(archived).not.toContain('href="/submissions/b"');
    expect(archived).toContain(">Restore<");
    expect(archived).not.toContain(">Delete<");
    expect(bulk.canDeleteSubmission).toHaveBeenCalledTimes(1);

    const deletable = renderToStaticMarkup(
      await SubmissionsPage({ searchParams: Promise.resolve({ status: "withdrawn" }) }),
    );
    expect(deletable).toContain(">Delete<");
  });
});

describe("NewDraftForm", () => {
  it("offers every scope and every type, with the risk note on high-risk types", () => {
    const html = renderToStaticMarkup(
      <NewDraftForm
        scopes={[
          { name: "platform", description: "Shared tools." },
          { name: "team", description: "A team." },
        ]}
        mine={[]}
      />,
    );
    expect(html).toContain("@platform");
    expect(html).toContain("@team");
    expect(html.match(/name="type"/g)).toHaveLength(11);
    // hook, mcp-server, permission-policy, statusline and lsp-server.
    expect(html.match(/>⚠ risk</g)).toHaveLength(5);
    // No type picked yet: the side panel asks for one.
    expect(html).toContain("Pick a type to see the ronne.yaml");
    expect(html).toContain('href="https://www.ronne.ai/marketplace/docs/scopes"');
    // The Documentation is on the website, opened in a new tab (088).
    expect(html).toMatch(
      /href="https:\/\/www\.ronne\.ai\/marketplace\/docs\/scopes"[^>]*target="_blank"/,
    );
    // Inline help (033) on the scope, the name and the type.
    expect(html).toContain("What&#x27;s a scope?");
    expect(html).toContain("How should I name it?");
    expect(html).toContain("Which type?");
  });

  it("says root has to create a scope first when there are none", () => {
    const html = renderToStaticMarkup(<NewDraftForm scopes={[]} mine={[]} />);
    expect(html).toContain("There are no scopes yet.");
    expect(html).not.toContain("<form");
  });
});

describe("pages", () => {
  it("lists my submissions, with New item", async () => {
    const html = renderToStaticMarkup(await SubmissionsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("My submissions");
    expect(html).toContain("@platform/code-reviewer");
    expect(html).toContain('href="/submissions/new"');
  });

  it("collects every page of scopes for the picker", async () => {
    scopes.listScopes
      .mockResolvedValueOnce({ scopes: [{ name: "a", description: "A." }], nextCursor: "a" })
      .mockResolvedValueOnce({ scopes: [{ name: "b", description: "B." }], nextCursor: null });
    const html = renderToStaticMarkup(await NewItemPage());
    expect(scopes.listScopes).toHaveBeenNthCalledWith(2, expect.any(Headers), { cursor: "a" });
    expect(html).toContain("@a");
    expect(html).toContain("@b");
  });
});

describe("releasing several at once (055)", () => {
  const approved = submission({ id: "01J0000000000000000000000D", status: "approved" });
  const draft = submission({ id: "01J0000000000000000000000E" });

  it("gives approved rows a release checkbox, and offers Release selected", () => {
    const html = renderToStaticMarkup(
      <BulkSubmitProvider ready={{}}>
        <BulkReleaseProvider releasable={{ [approved.id]: "@platform/code-reviewer" }}>
          <BulkReleaseToolbar />
          <SubmissionsTable
            {...table()}
            submissions={[approved, draft]}
            releasable={{ [approved.id]: "@platform/code-reviewer" }}
          />
        </BulkReleaseProvider>
      </BulkSubmitProvider>,
    );
    expect(html).toContain('aria-label="Select @platform/code-reviewer to release"');
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    expect(html).toContain("Select all approved (1)");
    expect(html).toMatch(/disabled=""[^>]*>.*?Release selected \(0\)/);
    expect(
      renderToStaticMarkup(
        <BulkReleaseProvider releasable={{}}>
          <BulkReleaseToolbar />
        </BulkReleaseProvider>,
      ),
    ).toBe("");
  });

  it("prepares and releases through the domain, and says what went wrong", async () => {
    publish.prepareRelease.mockResolvedValue({ candidates: [], refused: [] });
    expect(await releases.prepareReleaseAction(["a"])).toEqual({
      ok: true,
      candidates: [],
      refused: [],
    });
    publish.releaseMany.mockResolvedValue([
      { id: "a", name: "@t/a", result: "published", version: "1.0.0", tag: "latest", sha256: "x" },
    ]);
    const settings = { kind: "stable" as const, bump: "suggested" as const };
    expect(await releases.releaseSelectedAction(["a"], settings, "Notes.")).toMatchObject({
      ok: true,
      results: [{ result: "published" }],
    });
    expect(publish.releaseMany).toHaveBeenCalledWith(expect.any(Headers), {
      ids: ["a"],
      settings,
      notes: "Notes.",
    });
    const { BulkLimitError } = await import("@/server/domains/submissions/exceptions/errors");
    publish.releaseMany.mockRejectedValue(new BulkLimitError(51, 50));
    expect(await releases.releaseSelectedAction(["a"], settings, "")).toEqual({
      ok: false,
      error: "That's 51 submissions; one request takes at most 50.",
    });
  });
});

describe("the latest reviewer message (058)", () => {
  it("shows who sent it back or rejected it, and their message shortened, in full on hover", () => {
    const long = `Name the tabs rule. ${"Then explain why. ".repeat(10)}`;
    const html = renderToStaticMarkup(
      <SubmissionsTable
        {...table()}
        submissions={[
          submission({ id: "a", status: "changes_requested" }),
          submission({ id: "b", status: "rejected", name: "other" }),
          submission({ id: "c", status: "submitted", name: "third" }),
        ]}
        feedback={{
          a: { kind: "request_changes", by: "Mo Moderator", body: long },
          b: { kind: "reject", by: "Root", body: "Duplicates @platform/lint." },
        }}
      />,
    );
    expect(html).toContain("Changes requested by Mo Moderator: </span>Name the tabs rule.");
    expect(html).toContain(`title="${long}"`);
    expect(html).toContain("Rejected by Root: </span>Duplicates @platform/lint.");
    expect(html.match(/requested by|Rejected by/g)).toHaveLength(2);
  });

  it("shortens at a word, to one line", () => {
    expect(shortened("short")).toBe("short");
    expect(shortened("a\nb")).toBe("a b");
    const cut = shortened("word ".repeat(40));
    expect(cut.length).toBeLessThanOrEqual(121);
    expect(cut.endsWith("word…")).toBe(true);
  });

  it("reads them once for the list", async () => {
    mockList([submission({ status: "changes_requested" })]);
    bulk.latestFeedback.mockResolvedValueOnce({
      [submission().id]: { kind: "request_changes", by: "Mo", body: "Fix it." },
    });
    const html = renderToStaticMarkup(await SubmissionsPage({ searchParams: Promise.resolve({}) }));
    expect(bulk.latestFeedback).toHaveBeenCalledTimes(1);
    expect(html).toContain("Fix it.");
  });
});

describe("withdrawing from the list (058)", () => {
  it("offers Withdraw on each row until it's released, and Restore on archived ones", () => {
    const html = renderToStaticMarkup(
      <SubmissionsTable
        {...table()}
        submissions={[
          submission({ id: "a", name: "pending", status: "submitted" }),
          submission({ id: "b", name: "approved", status: "approved" }),
          submission({ id: "c", name: "released", status: "published" }),
          submission({ id: "d", name: "closed", status: "rejected" }),
          submission({ id: "e", name: "kept", status: "withdrawn" }),
        ]}
      />,
    );
    expect(html).toContain('aria-label="Withdraw: @platform/pending"');
    expect(html).toContain('aria-label="Withdraw: @platform/approved"');
    expect(html).not.toContain('aria-label="Withdraw: @platform/released"');
    expect(html).not.toContain('aria-label="Withdraw: @platform/closed"');
    expect(html).not.toContain('aria-label="Withdraw: @platform/kept"');
    expect(html).toContain(">Restore<");
  });
});
