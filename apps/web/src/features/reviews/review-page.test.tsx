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

const { RiskSummary } = await import("./RiskSummary");
const { AllFiles, FileChanges } = await import("./FileViews");
const { Conversation } = await import("./Conversation");
const { DecisionBar } = await import("./DecisionBar");
const { default: ReviewPage } = await import("@/app/(app)/reviews/[id]/page");

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
        events={[
          event({}),
          event({ id: "e2", kind: "comment", actor: { id: "m", name: "Mo" }, body: "<b>Why?</b>" }),
          event({
            id: "e3",
            kind: "request_changes",
            actor: { id: "m", name: "Mo" },
            body: "Fix it.",
          }),
        ]}
      />,
    );
    expect(html).toContain("submitted revision 1");
    expect(html).toContain("requested changes");
    expect(html).toContain("&lt;b&gt;Why?&lt;/b&gt;");
    expect(html).toContain('name="body"');
    expect(
      renderToStaticMarkup(<Conversation id="s" canComment={false} events={[]} />),
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
