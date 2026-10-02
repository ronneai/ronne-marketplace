import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewView } from "@/server/domains/submissions/actions/reviews";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { diffRevisions } from "@/server/domains/submissions/models/diff";
import type { ReviewEvent } from "@/server/domains/submissions/models/review";

const reviews = vi.hoisted(() => ({ getReview: vi.fn() }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/reviews", () => reviews);
const submissions = vi.hoisted(() => ({ dependencyMarks: vi.fn(async () => ({})) }));
vi.mock("@/server/domains/submissions/actions/submissions", () => submissions);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("./actions", () => ({ decideAction: vi.fn(), commentFromForm: vi.fn() }));
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
const { DecisionBar, DecisionDialog, DependentsChoice, dependentsMessage, RowDecisions } =
  await import("./DecisionBar");
const { default: ReviewPage } = await import("@/app/(app)/reviews/[id]/page");
const { BumpSuggestion } = await import("./PublishDialog");

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
    expect(html.match(/href="[^"]*"/g)).toEqual(['href="/docs/review#reviewing"']);
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
        decisions={[{ decision: "reject", allowed: false, reason }]}
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
  ({ decision, allowed: false, reason: OWN }) as const;

describe("the review page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.getCurrentUser.mockResolvedValue({
      id: "m",
      email: "m@x.test",
      name: "M",
      role: "moderator",
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

  it("disables Publish while a dependency isn't released (056)", async () => {
    const approved = view({
      can: { decide: false, override: false, comment: true, publish: true, sendBack: false },
    });
    reviews.getReview.mockResolvedValue({
      ...approved,
      submission: { ...approved.submission, status: "approved" },
    });
    expect(await render()).not.toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[^>]*>.*?Publish/);
    submissions.dependencyMarks.mockResolvedValueOnce({
      "01J0000000000000000000000A": [
        { kind: "waits", dependency: "@team/github", status: "approved" },
      ],
    });
    expect(await render()).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Publish: Waits on @team\/github \(pending release\)"/,
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
      role: "moderator",
    });
  });
  const proposal = (overrides: Partial<NonNullable<ReviewView["proposal"]>> = {}) => ({
    baseVersion: "1.0.0",
    stale: null,
    changes: diffRevisions([text("README.md", "Old.")], [text("README.md", "New.")]),
    unreleased: [] as string[],
    manifest: [{ field: "description", before: "Old.", after: "New." }],
    suggested: { bump: "patch" as const, reasons: ["nothing is added or removed"] },
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
        suggested={{ bump: "minor", reasons: ["`a.md` is new", "keyword `x` is new"] }}
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
            sendBack: { ok: false, reason: "Yours: edit or withdraw it." },
          },
        ]}
        sendBack
        onSendBack={() => undefined}
        text={dependentsMessage("@team/style")}
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
});
