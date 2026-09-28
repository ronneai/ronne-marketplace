import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewView } from "@/server/domains/submissions/actions/reviews";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { diffRevisions } from "@/server/domains/submissions/models/diff";
import type { ReviewEvent } from "@/server/domains/submissions/models/review";

const reviews = vi.hoisted(() => ({ getReview: vi.fn() }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/server/domains/submissions/actions/reviews", () => reviews);
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("./actions", () => ({ decideAction: vi.fn(), commentFromForm: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { RiskSummary } = await import("@/components/risk-flags/RiskSummary");
const { AllFiles, FileChanges } = await import("@/components/files/FileViews");
const { Conversation } = await import("./Conversation");
const { DecisionBar } = await import("./DecisionBar");
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
    expect(html).toContain('href="/reviews/s?view=all#file-ronne.yaml-L6"');
  });

  it("shows file and line as text without a review page, and nothing without flags", () => {
    const html = renderToStaticMarkup(<RiskSummary flags={flags} />);
    expect(html).not.toContain("href=");
    expect(html).toContain("ronne.yaml:6");
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

  it("gives every line of every file an anchor", () => {
    const html = renderToStaticMarkup(
      <AllFiles files={[text("ronne.yaml", "name: x\ntype: rule")]} />,
    );
    expect(html).toContain('id="file-ronne.yaml"');
    expect(html).toContain('id="file-ronne.yaml-L2"');
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
  flags: [
    { kind: "hook", message: "The hook runs the script `hook.sh`.", file: "ronne.yaml", line: 5 },
  ],
  issues: [],
  events: [event({ revision: 2, kind: "resubmit" })],
  published: [],
  can: { decide: true, override: false, comment: true, publish: false },
  proposal: null,
  ...overrides,
});

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
  });

  it("shows all files on request, and tells a reviewer about their own submission", async () => {
    reviews.getReview.mockResolvedValue(
      view({ mine: true, can: { decide: false, override: false, comment: true, publish: false } }),
    );
    const html = await render({ view: "all" });
    expect(html).toContain('id="file-hook.sh-L1"');
    expect(html).toContain("This is your own submission");
    expect(html).not.toContain(">Approve<");
  });

  it("offers Publish on an approved submission to those who may publish", async () => {
    expect(await render()).not.toContain(">Publish<");
    reviews.getReview.mockResolvedValue(
      view({ can: { decide: false, override: false, comment: true, publish: true } }),
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
