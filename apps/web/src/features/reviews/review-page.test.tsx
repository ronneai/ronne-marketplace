import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewView } from "@/server/domains/submissions/actions/reviews";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { diffRevisions } from "@/server/domains/submissions/models/diff";
import type { ReviewEvent } from "@/server/domains/submissions/models/review";
import { englishLeaks } from "@/test/english-leak";
import { inLocale, inLocaleAsync } from "@/test/intl";

const reviews = vi.hoisted(() => ({ getReview: vi.fn() }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/reviews", () => reviews);
const submissions = vi.hoisted(() => ({ dependencyMarks: vi.fn(async () => ({})) }));
vi.mock("@/server/domains/submissions/actions/submissions", () => submissions);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/scans/actions/scans", () => ({
  reviewScan: async () => ({ scan: null, canRequest: false }),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("./actions", () => ({ decideAction: vi.fn(), commentFromForm: vi.fn() }));
const releaseGroup = vi.hoisted(() => ({
  releaseGroupFor: vi.fn(async () => ({ blocked: null as string | null, goesWith: [] })),
}));
vi.mock("./release-group", () => releaseGroup);
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/reviews/s",
  useSearchParams: () => new URLSearchParams(),
}));

const { RiskSummary } = await import("@/components/risk-flags/RiskSummary");
const { FileChanges } = await import("@/components/files/FileViews");
const { ReviewAllFiles, ReviewChanges } = await import("./ReviewFiles");
const { Conversation } = await import("./Conversation");
const { DecisionBar, DecisionDialog, DependentsChoice, RowDecisions } = await import(
  "./DecisionBar"
);
const { default: ReviewPage } = await import("@/app/(app)/reviews/[id]/page");
const {
  BumpSuggestion,
  groupBlockedBy,
  groupVersions,
  PublishDialog,
  PublishedNotice,
  ReleaseGroupList,
  useTagWords,
} = await import("./PublishDialog");

const text = (path: string, content: string) => ({
  path,
  encoding: "utf8" as const,
  content,
  size: content.length,
  executable: false,
});
const event = (overrides: Partial<ReviewEvent>): ReviewEvent => ({
  id: "e1",
  submissionId: "s",
  actor: { id: "u", name: "Ada Author" },
  kind: "submit",
  body: null,
  revision: 1,
  createdAt: new Date("2026-09-28T10:00:00Z"),
  ...overrides,
});

describe("RiskSummary", () => {
  const flags = [
    {
      kind: "permission_policy" as const,
      message: "The policy allows `shell` `npm test`.",
      widening: true,
      file: "ronne.yaml",
      line: 6,
    },
    {
      kind: "network" as const,
      message: "It mentions `api.example.com`.",
      file: "SKILL.md",
      line: 2,
    },
  ];

  it("lists each flag, marks widening ones, and links to the file and line", () => {
    const html = renderToStaticMarkup(<RiskSummary flags={flags} base="/reviews/s" />);
    expect(html).toContain("What it can do (2)");
    expect(html).toContain("WIDENS:");
    expect(html).toContain("<code");
    // It opens the file at the line in the files view (058).
    expect(html).toContain('href="/reviews/s?view=all&amp;file=ronne.yaml&amp;line=6#files"');
  });

  it("shows file and line as text without a review page, and nothing without flags", () => {
    const html = renderToStaticMarkup(<RiskSummary flags={flags} />);
    // No links into files; only the helper's link to the Documentation (033).
    expect(html.match(/href="[^"]*"/g)).toEqual([
      'href="https://www.ronne.ai/en/marketplace/docs/review#reviewing"',
    ]);
    expect(html).toContain("ronne.yaml:6");
    expect(html).toContain("Why is it flagged?");
    expect(renderToStaticMarkup(<RiskSummary flags={[]} />)).toBe("");
  });
});

describe("file views", () => {
  it("shows changed lines with numbers and markers, and says when nothing changed", () => {
    const changes = diffRevisions([text("a.md", "one\ntwo\n")], [text("a.md", "one\n2\n")]);
    const html = renderToStaticMarkup(<FileChanges changes={changes} since={1} />);
    expect(html).toContain("a.md");
    expect(html).toContain(">changed<");
    expect(html).toContain("Removed: </span>two");
    expect(html).toContain("Added: </span>2");
    expect(renderToStaticMarkup(<FileChanges changes={[]} since={1} />)).toContain(
      "No changes since revision 1.",
    );
  });

  it("names what changed under .ronne/ in a line, without showing it", () => {
    const changes = diffRevisions([text("a.md", "one\n")], [text("a.md", "two\n")]);
    const html = renderToStaticMarkup(
      <FileChanges changes={changes} unreleased={[".ronne/layout.json"]} since={1} />,
    );
    expect(html).toContain('aria-label="a.md"');
    expect(html).not.toContain('aria-label=".ronne/layout.json"');
    expect(html).toMatch(
      /The canvas layout \(.*\.ronne\/layout\.json.*\) changed too\. It isn&#x27;t released, so it isn&#x27;t part of this diff\./,
    );
    // Alone, it's the only thing the diff has to say.
    const alone = renderToStaticMarkup(
      <FileChanges changes={[]} unreleased={[".ronne/layout.json"]} since={1} />,
    );
    expect(alone).toContain("No changes since revision 1.");
    expect(alone).toContain("The canvas layout (");
    // Anything else kept there is named as it is.
    const other = renderToStaticMarkup(
      <FileChanges changes={[]} unreleased={[".ronne/layout.json", ".ronne/notes.md"]} since={1} />,
    );
    expect(other).toContain(".ronne/notes.md");
    expect(other).toContain("Files in .ronne/ aren&#x27;t released");
    expect(renderToStaticMarkup(<FileChanges changes={changes} since={1} />)).not.toContain(
      "changed too",
    );
  });

  it("shows the files as a tree beside the one selected, as the item page does (058)", () => {
    const html = renderToStaticMarkup(
      <ReviewAllFiles
        files={[
          {
            path: "ronne.yaml",
            size: 18,
            executable: false,
            kind: "text",
            text: "name: x\ntype: rule",
          },
          { path: "rule.md", size: 5, executable: false, kind: "text", text: "Tabs." },
        ]}
        selected="ronne.yaml"
      />,
    );
    expect(html).toContain('aria-label="Files of this revision"');
    expect(html).toContain("rule.md");
    expect(html).toContain('aria-label="ronne.yaml"');
    expect(html).toContain("type: rule");
    expect(html).not.toContain(">Tabs.<");
  });

  it("lists the changed files, each marked, beside the diff of the one selected (058)", () => {
    const html = renderToStaticMarkup(
      <ReviewChanges
        changes={[
          ...diffRevisions([text("a.md", "one")], [text("a.md", "two"), text("b.md", "new")]),
        ]}
        selected="b.md"
        emptyText="No changes."
      />,
    );
    expect(html).toContain('aria-label="Changed files"');
    expect(html).toContain(">changed<");
    expect(html).toContain(">added<");
    expect(html).toContain('aria-label="b.md"');
    expect(html).not.toContain('aria-label="a.md"');
    expect(renderToStaticMarkup(<ReviewChanges changes={[]} emptyText="No changes." />)).toContain(
      "No changes.",
    );
  });
});

describe("Conversation", () => {
  it("says what each event was, shows bodies as text, and offers the form when open", () => {
    const html = renderToStaticMarkup(
      <Conversation
        id="s"
        canComment
        versionsHref="/items/team/fmt/versions"
        events={[
          event({}),
          event({ id: "e2", kind: "comment", actor: { id: "m", name: "Mo" }, body: "<b>Why?</b>" }),
          event({
            id: "e3",
            kind: "request_changes",
            actor: { id: "m", name: "Mo" },
            body: "Fix it.",
          }),
          event({ id: "e4", kind: "publish", actor: { id: "m", name: "Mo" }, body: "1.0.0" }),
        ]}
      />,
    );
    expect(html).toContain("submitted revision 1");
    expect(html).toContain("requested changes");
    expect(html).toContain("&lt;b&gt;Why?&lt;/b&gt;");
    expect(html).toMatch(/<a [^>]*href="\/items\/team\/fmt\/versions">released it as 1\.0\.0<\/a>/);
    expect(html).toContain('name="body"');
    expect(
      renderToStaticMarkup(
        <Conversation id="s" canComment={false} events={[]} versionsHref="/v" />,
      ),
    ).not.toContain('name="body"');
  });
});

describe("DecisionBar", () => {
  it("offers the decisions it's given, and nothing otherwise", () => {
    const html = renderToStaticMarkup(
      <DecisionBar id="s" decisions={["approve", "request_changes", "reject"]} />,
    );
    expect(html).toContain(">Approve<");
    expect(html).toContain(">Request changes<");
    expect(html).toContain("bg-error text-on-error");
    expect(renderToStaticMarkup(<DecisionBar id="s" decisions={[]} />)).toBe("");
  });

  it("shows a decision that isn't the viewer's disabled, with the reason (058)", () => {
    const html = renderToStaticMarkup(
      <DecisionBar
        id="s"
        decisions={[
          {
            decision: "reject",
            allowed: false,
            reason: "Your own submission: another moderator or root decides.",
            why: { code: "own_decide" },
          },
          { decision: "override", allowed: true },
        ]}
      />,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Reject<\/button>/);
    expect(html).toContain("Your own submission: another moderator or root decides.");
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>Approve \(override\)<\/button>/);
  });
});

describe("a queue row's decisions (058)", () => {
  it("offers Request changes and Reject, not Approve, each named for the row", () => {
    const html = renderToStaticMarkup(
      <RowDecisions
        id="s"
        name="@team/fmt"
        decisions={[
          { decision: "approve", allowed: true },
          { decision: "request_changes", allowed: true },
          { decision: "reject", allowed: true },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Request changes: @team/fmt"');
    expect(html).toContain('aria-label="Reject: @team/fmt"');
    expect(html).not.toContain(">Approve<");
    expect(renderToStaticMarkup(<RowDecisions id="s" name="x" decisions={[]} />)).toBe("");
  });

  it("disables them on the reviewer's own row, with the reason", () => {
    const reason = "Your own submission: another moderator or root decides.";
    const html = renderToStaticMarkup(
      <RowDecisions
        id="s"
        name="@team/fmt"
        decisions={[{ decision: "reject", allowed: false, reason, why: { code: "own_decide" } }]}
      />,
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Reject: @team\/fmt"|aria-label="Reject: @team\/fmt"[^>]*disabled=""/,
    );
    expect(html).toContain(reason);
  });

  it("asks for a required reason, and offers to send the dependents back when rejecting", () => {
    const html = renderToStaticMarkup(
      <DecisionDialog
        id="s"
        name="@team/style"
        decision="reject"
        via="queue"
        dependents={[
          {
            id: "d",
            name: "@team/kit",
            status: "submitted",
            authorName: "Ada",
            sendBack: { ok: true },
          },
        ]}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("Reject this submission?");
    expect(html).toMatch(/<textarea[^>]*required=""/);
    expect(html).toContain("Request changes on them too");
    expect(html).toContain("@team/kit");
  });
});

const view = (overrides: Partial<ReviewView> = {}): ReviewView => ({
  submission: {
    id: "01J0000000000000000000000A",
    authorId: "u",
    authorName: "Ada Author",
    scope: { id: "s", name: "team" },
    workspace: { id: "00000000000000000000000000", name: "global" },
    name: "fmt",
    type: "hook",
    status: "submitted",
    createdAt: new Date("2026-09-28T09:00:00Z"),
    updatedAt: new Date("2026-09-28T10:00:00Z"),
    submittedAt: new Date("2026-09-28T10:00:00Z"),
    proposal: null,
  },
  mine: false,
  revisions: [],
  current: { number: 2, files: [text("hook.sh", "echo hi")] },
  previous: 1,
  changes: diffRevisions([text("hook.sh", "echo")], [text("hook.sh", "echo hi")]),
  unreleased: [],
  flags: [
    { kind: "hook", message: "The hook runs the script `hook.sh`.", file: "ronne.yaml", line: 5 },
  ],
  issues: [],
  events: [event({ revision: 2, kind: "resubmit" })],
  published: [],
  gate: { blocked: false, threshold: null },
  decisions: [
    { decision: "approve", allowed: true },
    { decision: "request_changes", allowed: true },
    { decision: "reject", allowed: true },
  ],
  can: { decide: true, override: false, comment: true, publish: false, sendBack: false },
  proposal: null,
  dependents: [],
  ...overrides,
});

const OWN = "Your own submission: another moderator or root decides.";
const own = (decision: "approve" | "request_changes" | "reject") =>
  ({ decision, allowed: false, reason: OWN, why: { code: "own_decide" } }) as const;

describe("the review page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.getCurrentUser.mockResolvedValue({
      id: "m",
      email: "m@x.test",
      name: "M",
      role: "user",
      workspaces: { global: "moderator" },
    });
    reviews.getReview.mockResolvedValue(view());
  });

  const render = async (search: Record<string, string> = {}) =>
    renderToStaticMarkup(
      await ReviewPage({
        params: Promise.resolve({ id: "01J0000000000000000000000A" }),
        searchParams: Promise.resolve(search),
      }),
    );

  it("says what it waits on, and warns when a dependency is blocked (056)", async () => {
    expect(await render()).not.toContain("Waits on");
    submissions.dependencyMarks.mockResolvedValueOnce({
      "01J0000000000000000000000A": [
        { kind: "waits", dependency: "@team/github", status: "submitted" },
        { kind: "blocked", dependency: "@team/lint", status: "rejected", through: ["@team/base"] },
      ],
    });
    const html = await render();
    expect(html).toContain("WARN:");
    expect(html).toContain("A dependency won&#x27;t be released.");
    expect(html).toContain("Waits on @team/github (in review)");
    expect(html).toContain("Blocked: @team/lint waits on @team/base, which was rejected");
  });

  it("disables Publish while its group can't go, and not for an approved dependency (056, 112)", async () => {
    const approved = view({
      can: { decide: false, override: false, comment: true, publish: true, sendBack: false },
    });
    reviews.getReview.mockResolvedValue({
      ...approved,
      submission: { ...approved.submission, status: "approved" },
    });
    expect(await render()).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?Publish/);
    // An approved dependency goes with it (112): Publish stays on.
    submissions.dependencyMarks.mockResolvedValueOnce({
      "01J0000000000000000000000A": [
        { kind: "waits", dependency: "@team/github", status: "approved" },
      ],
    });
    expect(await render()).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?Publish/);
    // One still in review holds the group.
    releaseGroup.releaseGroupFor.mockResolvedValueOnce({
      blocked: "It waits on @team/github, which is submitted.",
      goesWith: [],
    });
    expect(await render()).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Publish: It waits on @team\/github, which is submitted."/,
    );
  });

  it("shows the header, decisions, risk summary, changes since the last revision, checks and conversation", async () => {
    const html = await render();
    expect(html).toContain("@team/fmt");
    expect(html).toContain("Ada Author");
    expect(html).toContain("revision 2");
    expect(html).toContain(">Approve<");
    expect(html).toContain("What it can do (1)");
    expect(html).toMatch(/aria-current="page"[^>]*>Changes since revision 1/);
    expect(html).toContain("Checks on revision 2");
    expect(html).toContain("resubmitted it as revision 2");
    expect(html).toContain("What do these do?");
  });

  it("shows all files on request, and tells a reviewer about their own submission", async () => {
    reviews.getReview.mockResolvedValue(
      view({
        mine: true,
        decisions: [own("approve"), own("request_changes"), own("reject")],
        can: { decide: false, override: false, comment: true, publish: false, sendBack: false },
      }),
    );
    const html = await render({ view: "all" });
    expect(html).toContain('aria-label="hook.sh"');
    expect(html).toContain("echo hi");
    expect(html).toContain("This is your own submission");
    // The decisions show, disabled, with why (058).
    for (const label of ["Approve", "Request changes", "Reject"])
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`));
    expect(html).toContain(OWN);
  });

  it("shows root its own submission's decisions disabled, and the override (058)", async () => {
    reviews.getReview.mockResolvedValue(
      view({
        mine: true,
        decisions: [
          own("approve"),
          own("request_changes"),
          own("reject"),
          { decision: "override", allowed: true },
        ],
        can: { decide: false, override: true, comment: true, publish: false, sendBack: false },
      }),
    );
    const html = await render();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Reject<\/button>/);
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>Approve \(override\)<\/button>/);
    expect(html).toContain("This is your own submission: another moderator or root reviews it.");
    expect(html).toContain("you can approve it yourself as an override");
  });

  it("leaves .ronne/ out of the files, and opens the file a link asks for (058)", async () => {
    reviews.getReview.mockResolvedValue(
      view({
        current: {
          number: 2,
          files: [
            text("hook.sh", "echo hi"),
            text("ronne.yaml", "name: x"),
            text(".ronne/layout.json", "{}"),
          ],
        },
      }),
    );
    const html = await render({ view: "all", file: "hook.sh", line: "1" });
    expect(html).not.toContain("layout.json");
    expect(html).toContain('aria-label="hook.sh"');
    expect(html).not.toContain('aria-label="ronne.yaml"');
  });

  it("lets the author withdraw their own from the review page, and nobody else (058)", async () => {
    expect(await render()).not.toContain('aria-label="Withdraw: @team/fmt"');
    reviews.getReview.mockResolvedValue(view({ mine: true, decisions: [] }));
    expect(await render()).toContain('aria-label="Withdraw: @team/fmt"');
  });

  it("tells an author without a review role about their own submission, with no decisions", async () => {
    reviews.getReview.mockResolvedValue(
      view({
        mine: true,
        decisions: [],
        can: { decide: false, override: false, comment: true, publish: false, sendBack: false },
      }),
    );
    const html = await render();
    expect(html).toContain("This is your own submission");
    expect(html).not.toContain(">Reject<");
  });

  it("offers Publish on an approved submission to those who may publish", async () => {
    expect(await render()).not.toContain(">Publish<");
    reviews.getReview.mockResolvedValue(
      view({
        can: { decide: false, override: false, comment: true, publish: true, sendBack: false },
      }),
    );
    expect(await render()).toContain("Publish");
  });

  it("links to the item's Versions page in the header once it has a published version", async () => {
    expect(await render()).not.toContain("View versions");
    reviews.getReview.mockResolvedValue(view({ published: ["1.0.0"] }));
    expect(await render()).toMatch(
      /<a [^>]*href="\/items\/team\/fmt\/versions"[^>]*>.*View versions<\/a>/,
    );
  });

  it("is a 404 for anyone who can't review, and for a submission they can't see", async () => {
    reviews.getReview.mockRejectedValue(new SubmissionNotFoundError());
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
    session.getCurrentUser.mockResolvedValue({
      id: "u",
      email: "u@x.test",
      name: "U",
      role: "user",
    });
    await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("a change proposal's review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.getCurrentUser.mockResolvedValue({
      id: "m",
      email: "m@x.test",
      name: "M",
      role: "user",
      workspaces: { global: "moderator" },
    });
  });
  const proposal = (overrides: Partial<NonNullable<ReviewView["proposal"]>> = {}) => ({
    baseVersion: "1.0.0",
    stale: null,
    changes: diffRevisions([text("README.md", "Old.")], [text("README.md", "New.")]),
    unreleased: [] as string[],
    manifest: [{ field: "description", before: "Old.", after: "New." }],
    suggested: { bump: "patch" as const, reasons: [{ kind: "nothing" as const, names: [] }] },
    ...overrides,
  });
  const renderWith = async (
    p: ReturnType<typeof proposal> | null,
    search: Record<string, string> = {},
  ) => {
    const data = view();
    reviews.getReview.mockResolvedValue({ ...data, proposal: p });
    return renderToStaticMarkup(
      await ReviewPage({
        params: Promise.resolve({ id: "01J0000000000000000000000A" }),
        searchParams: Promise.resolve(search),
      }),
    );
  };

  it("opens on the changes to the base version: manifest fields side by side, then the files", async () => {
    const html = await renderWith(proposal());
    expect(html).toMatch(/aria-current="page"[^>]*>Changes to 1\.0\.0/);
    expect(html).toContain('href="/reviews/01J0000000000000000000000A?view=changes"');
    expect(html).toContain('href="/reviews/01J0000000000000000000000A?view=all"');
    expect(html).toContain("ronne.yaml fields");
    expect(html).toMatch(/>description<\/td><td[^>]*>Old\.<\/td><td[^>]*>New\.</);
    expect(html).toContain('aria-label="README.md"');
  });

  it("still shows the changes since the last revision on request", async () => {
    const html = await renderWith(proposal(), { view: "changes" });
    expect(html).toMatch(/aria-current="page"[^>]*>Changes since revision 1/);
    expect(html).toMatch(/href="\/reviews\/01J0000000000000000000000A"[^>]*>Changes to/);
  });

  it("says when nothing changed, or when the base can't be read", async () => {
    expect(await renderWith(proposal({ changes: [], manifest: [] }))).toContain(
      "No changes to 1.0.0.",
    );
    expect(await renderWith(proposal({ changes: null }))).toContain("couldn&#x27;t be read");
  });

  it("has no base view for a new item", async () => {
    const html = await renderWith(null, { view: "base" });
    expect(html).not.toContain("Changes to");
  });

  it("explains the suggested bump", () => {
    const html = renderToStaticMarkup(
      <BumpSuggestion
        suggested={{
          bump: "minor",
          reasons: [
            { kind: "fileNew", names: ["a.md"] },
            { kind: "keywordNew", names: ["x"] },
          ],
        }}
      />,
    );
    expect(html).toMatch(/Suggested: <span[^>]*>minor<\/span>, because/);
    expect(html).toContain("`a.md` is new; keyword `x` is new.");
  });
});

describe("rejecting a dependency (056)", () => {
  it("lists the dependents, with who can't be sent back, and offers to send the rest back", () => {
    const html = renderToStaticMarkup(
      <DependentsChoice
        dependents={[
          {
            id: "a",
            name: "@team/kit",
            status: "approved",
            authorName: "Ada",
            sendBack: { ok: true },
          },
          {
            id: "b",
            name: "@team/mods",
            status: "submitted",
            authorName: "Mo",
            sendBack: { ok: false, reason: "Yours: edit or withdraw it.", why: { code: "yours" } },
          },
        ]}
        sendBack
        onSendBack={() => undefined}
        text="@team/style was rejected: remove it from dependencies, or depend on another item."
        onText={() => undefined}
      />,
    );
    expect(html).toContain("2 submissions depend");
    expect(html).toContain("(approved, by Ada)");
    expect(html).toContain("(submitted, by Mo): Yours: edit or withdraw it.");
    expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(html).toContain("Request changes on them too");
    expect(html).toContain(
      "@team/style was rejected: remove it from dependencies, or depend on another item.",
    );
  });

  it("previews what's released with it, each at the version it gets (112)", () => {
    const members = [
      { name: "@team/new", published: [], suggested: null },
      { name: "@team/old", published: ["1.2.0"], suggested: "patch" as const },
      { name: "@team/plain", published: ["2.0.0"], suggested: null },
    ];
    expect(groupVersions(members, "stable", "beta")).toEqual([
      { name: "@team/new", version: "1.0.0" },
      { name: "@team/old", version: "1.2.1" },
      { name: "@team/plain", version: "2.1.0" },
    ]);
    expect(groupVersions(members.slice(0, 1), "prerelease", "beta")).toEqual([
      { name: "@team/new", version: "1.0.0-beta.1" },
    ]);
    const html = renderToStaticMarkup(
      <ReleaseGroupList members={groupVersions(members.slice(0, 2), "stable", "")} />,
    );
    expect(html).toContain("Released with these 2:");
    expect(html).toContain('aria-label="Released with it"');
    expect(html).toMatch(/@team\/new<\/span> <span[^>]*>1\.0\.0</);
    expect(html).toMatch(/@team\/old<\/span> <span[^>]*>1\.2\.1</);
    expect(html).toContain("Why do these go together?");
  });

  it("turns Publish off when one of the group gets no version (112)", () => {
    const rc = [
      { name: "@team/x", published: ["1.0.0", "1.1.0-rc.1"], suggested: "minor" as const },
    ];
    const group = groupVersions(rc, "prerelease", "beta");
    expect(group).toEqual([{ name: "@team/x", version: null }]);
    // The first that gets no version; the dialog words it.
    expect(groupBlockedBy(group)).toBe("@team/x");
    expect(groupBlockedBy(groupVersions(rc, "stable", ""))).toBeNull();
  });
});

describe("a review's page in three languages (131)", () => {
  type L = "en" | "pt" | "fr";
  const html = (l: L, node: Parameters<typeof renderToStaticMarkup>[0]) =>
    inLocale(l, () => renderToStaticMarkup(node)).replace(/<!-- -->/g, "");
  const page = async (
    l: L,
    data: Partial<ReviewView> = {},
    search: Record<string, string> = {},
  ) => {
    reviews.getReview.mockResolvedValue(view(data));
    return inLocaleAsync(l, async () =>
      renderToStaticMarkup(
        await ReviewPage({
          params: Promise.resolve({ id: "01J0000000000000000000000A" }),
          searchParams: Promise.resolve(search),
        }),
      ),
    );
  };
  beforeEach(() => {
    vi.clearAllMocks();
    session.getCurrentUser.mockResolvedValue({
      id: "m",
      email: "m@x.test",
      name: "M",
      role: "user",
      workspaces: { global: "moderator" },
    });
  });

  it("words the header, the views, the checks and the decisions", async () => {
    const pt = await page("pt");
    expect(pt).toContain('aria-label="Trilha de navegação"');
    expect(pt).toContain(">Revisões<");
    expect(pt).toContain('por <span class="text-fg">Ada Author</span>');
    expect(pt).toContain(">revisão 2<");
    expect(pt).toContain("submetida <time");
    expect(pt).toContain(">Alterações desde a revisão 1<");
    expect(pt).toContain(">Todos os arquivos<");
    expect(pt).toContain(">Verificações da revisão 2<");
    expect(pt).toContain(">Aprovar<");
    expect(pt).toContain(">Solicitar alterações<");
    expect(pt).toContain(">Conversa<");
    const fr = await page("fr", {
      mine: true,
      can: { decide: false, override: true, comment: true, publish: false, sendBack: false },
    });
    expect(fr).toContain("(vous)");
    expect(fr).toContain("En tant que root, vous pouvez l’approuver vous-même par dérogation");
    const { generateMetadata } = await import("@/app/(app)/reviews/[id]/page");
    expect(await inLocaleAsync("fr", () => generateMetadata())).toEqual({
      title: "Révision · Ronne AI Marketplace",
    });
  });

  it("words a stale proposal's notice and its changes", async () => {
    const stale = {
      baseVersion: "1.0.0",
      stale: "1.1.0",
      changes: null,
      unreleased: [] as string[],
      manifest: [{ field: "description", before: null, after: "New." }],
      suggested: null,
    };
    const pt = await page("pt", { proposal: stale as never });
    expect(pt).toContain("A 1.1.0 foi lançada depois que esta proposta começou.");
    expect(pt).toContain(">Alterações em relação à 1.0.0<");
    expect(pt).toContain(">Campos do ronne.yaml<");
    expect(pt).toContain(">(não definido)<");
    expect(pt).toContain("Não foi possível ler os arquivos da 1.0.0");
  });

  it("words each event of the conversation", () => {
    const kinds = [
      ["submit", 2, null],
      ["resubmit", 3, null],
      ["comment", 3, "Hi."],
      ["request_changes", 3, "Fix."],
      ["approve", 3, null],
      ["reject", 3, "No."],
      ["override", 3, null],
      ["self_approve", 1, null],
      ["withdraw", 3, null],
      ["restore", 3, null],
      ["publish", 3, "1.2.0"],
      ["publish", 3, null],
      ["rebase", 3, "1.3.0"],
      ["rebase", 3, null],
    ] as const;
    const events = kinds.map(([kind, revision, body], i) =>
      event({ id: `e${i}`, kind, revision, body } as never),
    );
    const convo = (l: L) =>
      html(l, <Conversation id="s" events={events} canComment versionsHref="/v" />);
    const en = convo("en");
    expect(en).toContain("submitted revision 2");
    expect(en).toContain("released it as 1.2.0");
    expect(en).toContain("rebased it onto a newer version");
    const pt = convo("pt");
    expect(pt).toContain("submeteu a revisão 2");
    expect(pt).toContain("ressubmeteu como revisão 3");
    expect(pt).toContain("aprovou a própria submissão, como root (exceção)");
    expect(pt).toContain("lançou como 1.2.0");
    expect(pt).toContain("lançou como uma nova versão");
    expect(pt).toContain(">Comentar<");
    const fr = convo("fr");
    expect(fr).toContain("a fait un rebase sur la 1.3.0");
    expect(fr).toContain("l’a archivée");
  });

  it("words the decision dialogs and the dependents' choice, with 1 and 2", () => {
    const dialog = (l: L, decision: "approve" | "request_changes" | "reject" | "override") =>
      html(l, <DecisionDialog id="s" name="@t/{x}" decision={decision} onClose={() => {}} />);
    // Each decision's title, hint and button, in each language.
    const words: Record<
      "pt" | "fr",
      Record<"approve" | "request_changes" | "reject" | "override", [string, string, string]>
    > = {
      pt: {
        approve: ["Aprovar esta submissão?", "Opcional. Depois de aprovada", ">Aprovar<"],
        request_changes: [
          "Solicitar alterações",
          "Obrigatório. Diga o que alterar",
          ">Solicitar alterações<",
        ],
        reject: ["Rejeitar esta submissão?", "Obrigatório. Rejeitar é definitivo", ">Rejeitar<"],
        override: [
          "Aprovar a sua própria submissão?",
          "Opcional. Como root, você pode aprovar",
          ">Aprovar (exceção)<",
        ],
      },
      fr: {
        approve: ["Approuver cette soumission?", "Facultatif. Une fois approuvée", ">Approuver<"],
        request_changes: [
          "Demander des modifications",
          "Obligatoire. Dites quoi modifier",
          ">Demander des modifications<",
        ],
        reject: ["Rejeter cette soumission?", "Obligatoire. Un rejet est définitif", ">Rejeter<"],
        override: [
          "Approuver votre propre soumission?",
          "Facultatif. En tant que root, vous pouvez",
          ">Approuver (dérogation)<",
        ],
      },
    };
    for (const l of ["pt", "fr"] as const)
      for (const decision of ["approve", "request_changes", "reject", "override"] as const) {
        const [title, hint, button] = words[l][decision];
        const text = dialog(l, decision);
        // The title as the dialog's heading, not anywhere (it can match the button).
        expect(text.match(/<h2 [^>]*>([^<]*)<\/h2>/)?.[1], `${l} ${decision} title`).toBe(title);
        expect(text, `${l} ${decision} hint`).toContain(hint);
        expect(text, `${l} ${decision} button`).toContain(button);
      }
    expect(dialog("en", "override")).toContain(">Approve (override)<");
    const dep = (status: "submitted" | "changes_requested", ok: boolean) => ({
      id: status,
      name: `@t/${status}`,
      status,
      authorName: "Ana",
      sendBack: ok
        ? { ok: true as const }
        : {
            ok: false as const,
            reason: "Yours: edit or withdraw it.",
            why: { code: "yours" as const },
          },
    });
    const choice = (l: L, n: number) =>
      html(
        l,
        <DependentsChoice
          dependents={
            [dep("submitted", true), dep("changes_requested", false)].slice(0, n) as never
          }
          sendBack
          onSendBack={() => {}}
          text="x"
          onText={() => {}}
        />,
      );
    expect(choice("en", 0)).toContain("0 submissions depend on this");
    expect(choice("pt", 0)).toContain("0 submissão depende desta");
    expect(choice("fr", 0)).toContain("0 soumission en dépend");
    expect(choice("en", 2)).toContain("2 submissions depend on this");
    expect(choice("en", 1)).toContain("1 submission depends on this");
    expect(choice("pt", 1)).toContain("1 submissão depende desta");
    expect(choice("pt", 2)).toContain("2 submissões dependem desta");
    expect(choice("pt", 2)).toContain(
      "(alterações solicitadas, por Ana): É sua: edite-a ou retire-a.",
    );
    expect(choice("fr", 2)).toContain("C’est la vôtre : modifiez-la ou retirez-la.");
    expect(choice("en", 2)).toContain("Yours: edit or withdraw it.");
    expect(choice("fr", 1)).toContain("1 soumission en dépend");
    expect(choice("fr", 2)).toContain("(soumis, par Ana)");
    expect(choice("fr", 2)).toContain("Leur demander aussi des modifications");
    const prefilled = html(
      "pt",
      <DecisionDialog
        id="s"
        name="@t/{x}"
        decision="reject"
        dependents={[dep("submitted", true)] as never}
        onClose={() => {}}
      />,
    );
    expect(prefilled).toContain("@t/{x} foi rejeitado: remova-o das dependências");
    const rows = (l: L) =>
      html(
        l,
        <RowDecisions
          id="s"
          name="@t/a"
          decisions={[
            { decision: "request_changes", allowed: true },
            { decision: "reject", allowed: true },
          ]}
        />,
      );
    expect(rows("pt")).toContain('aria-label="Rejeitar: @t/a"');
    expect(rows("fr")).toContain('aria-label="Demander des modifications : @t/a"');
  });

  it("words the publish dialog, its suggestion, group and tag problems", () => {
    const dialog = (l: L, props: Partial<Parameters<typeof PublishDialog>[0]> = {}) =>
      html(
        l,
        <PublishDialog
          id="s"
          itemName="@t/a"
          published={["1.0.0"]}
          versionsHref="/v"
          defaultOpen
          {...props}
        />,
      );
    const pt = dialog("pt", {
      suggested: {
        bump: "minor",
        reasons: [
          { kind: "fileNew", names: ["a.md"] },
          { kind: "blockGained", names: ["x"], type: "hook" },
        ],
      },
    });
    expect(pt).toContain("Publicar @t/a");
    expect(pt).toContain(">Estável<");
    expect(pt).toContain("Minor: novidades, compatível");
    expect(pt).toContain("porque `a.md` é novo; o bloco hook ganha `x`.");
    expect(pt).toContain('Publica <span class="font-mono">@t/a</span>');
    expect(pt).toContain(">Publicar 1.1.0<");
    const fr = dialog("fr", {
      goesWith: [{ name: "@t/b", published: [], suggested: null }],
      suggested: { bump: "major", reasons: [{ kind: "depLost", names: ["@t/c"] }] },
    });
    expect(fr).toContain("Suggéré : <span");
    expect(fr).toContain(", car il ne dépend plus de `@t/c`.");
    expect(fr).toContain("Publié avec :");
    expect(fr).toContain(">Étiquette<");
    const two = dialog("en", {
      goesWith: [
        { name: "@t/b", published: [], suggested: null },
        { name: "@t/c", published: [], suggested: null },
      ],
    });
    expect(two).toContain("Released with these 2:");
    expect(
      html(
        "pt",
        <ReleaseGroupList
          members={[
            { name: "@t/b", version: "1.0.0" },
            { name: "@t/c", version: null },
          ]}
        />,
      ),
    ).toContain("Lançados junto (2):");
    const reasons = (l: L, kind: string, type?: string) =>
      html(
        l,
        <BumpSuggestion
          suggested={{ bump: "patch", reasons: [{ kind: kind as never, names: ["n"], type }] }}
        />,
      );
    expect(reasons("en", "nothing")).toContain("because nothing is added or removed.");
    expect(reasons("pt", "fileRemoved")).toContain("`n`, citado no manifesto, foi removido");
    expect(reasons("fr", "keywordNew")).toContain("le mot-clé `n` est nouveau");
    expect(reasons("fr", "blockLost", "agent")).toContain("le bloc agent n’a plus `n`");
  });

  it("says what a release published, with 0, 1, 2 and 3 others", () => {
    const others = [
      { name: "@t/b", version: "1.0.0" },
      { name: "@t/c", version: "2.0.0" },
      { name: "@t/d", version: "3.0.0" },
    ];
    const notice = (l: L, n: number) =>
      html(
        l,
        <PublishedNotice
          itemName="@t/{a}"
          result={
            {
              ok: true,
              version: "1.1.0",
              tag: "latest",
              sha256: "abc",
              with: others.slice(0, n),
            } as never
          }
        />,
      );
    expect(notice("en", 0)).toContain("Published @t/{a} 1.1.0 as latest.");
    expect(notice("en", 1)).toContain("Published @t/{a} 1.1.0 as latest, with @t/b 1.0.0.");
    expect(notice("en", 3)).toContain(
      "Published @t/{a} 1.1.0 as latest, with @t/b 1.0.0, @t/c 2.0.0, and @t/d 3.0.0.",
    );
    expect(notice("pt", 0)).toContain("@t/{a} 1.1.0 publicado como latest.");
    expect(notice("pt", 2)).toContain(
      "@t/{a} 1.1.0 publicado como latest, com @t/b 1.0.0 e @t/c 2.0.0.",
    );
    expect(notice("fr", 1)).toContain("@t/{a} 1.1.0 publié comme latest, avec @t/b 1.0.0.");
    expect(notice("fr", 3)).toContain("avec @t/b 1.0.0, @t/c 2.0.0 et @t/d 3.0.0.");
    expect(notice("fr", 0)).toContain("sha256 abc");
    expect(notice("fr", 0)).toContain("@t/{a} 1.1.0 publié comme latest.");
  });

  it("says when one that goes along gets no version", () => {
    const stuck = (l: L) =>
      html(
        l,
        <PublishDialog
          id="s"
          itemName="@t/a"
          published={["1.0.0"]}
          versionsHref="/v"
          defaultOpen
          defaultKind="prerelease"
          goesWith={[{ name: "@t/x", published: ["1.0.0", "1.1.0-rc.1"], suggested: null }]}
        />,
      );
    // A beta of the next minor would sort before @t/x's 1.1.0-rc.1: no version for it.
    expect(stuck("en")).toContain("@t/x gets no version from that");
    expect(stuck("fr")).toContain(
      "@t/x n’obtient pas de version ainsi : il ne peut pas être publié en même temps de cette façon.",
    );
    expect(stuck("pt")).toContain(
      "@t/x não recebe versão assim: não pode ser lançado junto dessa forma.",
    );
  });

  it("words each tag problem", () => {
    const words = (l: L) => {
      let value: ReturnType<typeof useTagWords> | undefined;
      const Grab = () => {
        value = useTagWords();
        return null;
      };
      html(l, <Grab />);
      return value as ReturnType<typeof useTagWords>;
    };
    expect(words("en")("Beta!", "1.0.0")).toBe(
      "A tag is 1 to 32 lowercase letters, digits and hyphens, starting with a letter.",
    );
    expect(words("pt")("x", "1.0.0")).toBe(
      "x parece um intervalo de versões, então não pode ser uma tag.",
    );
    expect(words("fr")("latest", "1.0.0-beta.1")).toBe(
      "latest ne peut pointer que vers une version stable, pas vers une préversion.",
    );
    expect(words("fr")("Beta!", "1.0.0")).toBe(
      "Une étiquette fait de 1 à 32 lettres minuscules, chiffres et traits d’union, et commence par une lettre.",
    );
    expect(words("pt")("stable", "1.0.0")).toBeNull();
  });

  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: no English left on a review's page and its dialogs`, async () => {
      const all = [
        await page(locale),
        await page(locale, {
          mine: true,
          can: { decide: false, override: true, comment: true, publish: false, sendBack: false },
        }),
        html(locale, <DecisionDialog id="s" name="@t/a" decision="reject" onClose={() => {}} />),
        html(
          locale,
          <PublishDialog
            id="s"
            itemName="@t/a"
            published={["1.0.0"]}
            versionsHref="/v"
            defaultOpen
            suggested={{ bump: "minor", reasons: [{ kind: "fileNew", names: ["a.md"] }] }}
            goesWith={[{ name: "@t/b", published: [], suggested: null }]}
          />,
        ),
      ].join("\n");
      expect(await englishLeaks(["author", "help", "common"], locale, all)).toEqual([]);
    });
  }
});
