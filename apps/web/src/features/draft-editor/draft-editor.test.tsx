import type { ManifestIssue } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { treeRows } from "@/components/code/FileTree";
import { languageFor } from "@/components/code/languages";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import type { Draft } from "@/server/domains/submissions/models/submission";
import { inLocaleAsync } from "@/test/intl";
import { changesOf, type FilesState, filesReducer, isDirty, newPathProblem } from "./files";
import type { EditorFile, GroupMember } from "./types";

const drafts = vi.hoisted(() => ({
  viewSubmission: vi.fn(),
  dependencyMarks: vi.fn(async () => ({})),
  canDeleteSubmission: vi.fn(async () => true),
}));
vi.mock("@/server/domains/submissions/actions/submissions", () => drafts);
const saving = vi.hoisted(() => ({
  draftSubmitIssues: vi.fn(async (): Promise<ManifestIssue[]> => []),
}));
vi.mock("@/server/domains/submissions/actions/drafts", () => saving);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/submissions/01J0000000000000000000000A",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./actions", () => ({}));
// A submitted item's page also reads its review and scan (137).
const review = vi.hoisted(() => ({ getReview: vi.fn(), countDependents: vi.fn(async () => 0) }));
vi.mock("@/server/domains/submissions/actions/reviews", () => review);
const scans = vi.hoisted(() => ({ reviewScan: vi.fn() }));
vi.mock("@/server/domains/scans/actions/scans", () => scans);
// What goes out with an approved one (112): nothing else, nothing blocking.
vi.mock("@/features/reviews/release-group", () => ({
  releaseGroupFor: vi.fn(async () => ({ blocked: null, goesWith: [] })),
}));
// A change proposal's panel (017): out of date, onto 1.0.1.
const proposals = vi.hoisted(() => ({
  proposalPanel: vi.fn(
    async (): Promise<{ baseVersion: string; stale: string | null; conflicts: [] }> => ({
      baseVersion: "1.0.0",
      stale: "1.0.1",
      conflicts: [],
    }),
  ),
}));
vi.mock("@/server/domains/submissions/actions/proposals", () => proposals);

const { DraftEditor } = await import("./DraftEditor");
const { afterSubmit, GroupList, SubmitOutcome, useSubmitWords, WithdrawDialog } = await import(
  "./SubmitDialogs"
);
const { usePathWords } = await import("./FileDialogs");

/** A words hook's functions, in English: hooks run inside a render. */
const grab = <T,>(hook: () => T): T => {
  let value: T | undefined;
  const Grab = () => {
    value = hook();
    return null;
  };
  renderToStaticMarkup(<Grab />);
  return value as T;
};
const { label: submitLabel, blocked: submitBlocked } = grab(useSubmitWords);
const pathWords = grab(usePathWords);
const { toPreview } = await import("./submit-preview");
const { default: DraftPage } = await import("@/app/(app)/submissions/[id]/page");

const T1 = "2026-09-27T10:00:00.000Z";
const saved = (path: string, content: string): EditorFile => ({
  path,
  encoding: "utf8",
  content,
  size: content.length,
  executable: false,
  loadedAt: T1,
  dirty: false,
});
const start = (): FilesState => ({
  files: [saved("prompt.md", "Hi"), saved("ronne.yaml", "name: x\n")],
  removed: [],
});

describe("filesReducer", () => {
  it("tracks edits, new files, renames and deletes, and what a save sends", () => {
    let state = filesReducer(start(), { type: "edit", path: "prompt.md", content: "Héllo" });
    expect(state.files[0]).toMatchObject({ content: "Héllo", size: 6, dirty: true });
    state = filesReducer(state, { type: "put", path: "docs/a.md", encoding: "utf8", content: "A" });
    state = filesReducer(state, { type: "rename", from: "prompt.md", to: "agent.md" });
    state = filesReducer(state, { type: "remove", path: "docs/a.md" });
    expect(state.files.map((f) => f.path)).toEqual(["agent.md", "ronne.yaml"]);
    expect(changesOf(state)).toEqual({
      writes: [
        { path: "agent.md", encoding: "utf8", content: "Héllo", executable: false, loadedAt: null },
      ],
      // The saved file renamed away; docs/a.md was never saved, so there's nothing to delete.
      deletes: [{ path: "prompt.md", loadedAt: T1 }],
    });
  });

  it("keeps a saved file's loadedAt when it comes back to its path, so stale checks still work", () => {
    let state = filesReducer(start(), { type: "rename", from: "prompt.md", to: "x.md" });
    state = filesReducer(state, { type: "rename", from: "x.md", to: "prompt.md" });
    expect(changesOf(state)).toEqual({
      writes: [
        { path: "prompt.md", encoding: "utf8", content: "Hi", executable: false, loadedAt: T1 },
      ],
      deletes: [],
    });
  });

  it("marks files saved, unless they changed while the save was on its way", () => {
    let state = filesReducer(start(), { type: "edit", path: "prompt.md", content: "one" });
    state = filesReducer(state, { type: "edit", path: "ronne.yaml", content: "name: y\n" });
    const sent = changesOf(state).writes;
    state = filesReducer(state, { type: "edit", path: "prompt.md", content: "one, two" });
    const T2 = "2026-09-27T11:00:00.000Z";
    state = filesReducer(state, {
      type: "saved",
      saved: [
        { path: "prompt.md", loadedAt: T2 },
        { path: "ronne.yaml", loadedAt: T2 },
      ],
      sent,
      removed: [],
    });
    expect(state.files.map((f) => [f.path, f.dirty, f.loadedAt])).toEqual([
      ["prompt.md", true, T2],
      ["ronne.yaml", false, T2],
    ]);
    expect(isDirty(state)).toBe(true);
  });

  it("shows what the save rewrote itself, unless it was edited meanwhile (097)", () => {
    let state = filesReducer(start(), { type: "edit", path: "prompt.md", content: "agent: @a/b" });
    const sent = changesOf(state).writes;
    const T2 = "2026-09-27T11:00:00.000Z";
    const saved = {
      type: "saved" as const,
      saved: [
        { path: "prompt.md", loadedAt: T2 },
        { path: "ronne.yaml", loadedAt: T2 },
      ],
      rewritten: [
        { path: "prompt.md", content: 'agent: "@a/b"' },
        { path: "ronne.yaml", content: 'name: x\ndependencies:\n  "@a/b": ^1.0.0\n' },
      ],
      sent,
      removed: [],
    };
    const after = filesReducer(state, saved);
    expect(after.files.map((f) => [f.path, f.content, f.dirty, f.loadedAt])).toEqual([
      ["prompt.md", 'agent: "@a/b"', false, T2],
      ["ronne.yaml", 'name: x\ndependencies:\n  "@a/b": ^1.0.0\n', false, T2],
    ]);
    // The editor echoes the rewrite as an edit of the same text: still saved.
    const echoed = filesReducer(after, {
      type: "edit",
      path: "prompt.md",
      content: 'agent: "@a/b"',
    });
    expect(echoed.files.find((f) => f.path === "prompt.md")?.dirty).toBe(false);
    // Edited while the save was on its way: the edit stays, unsaved.
    state = filesReducer(state, { type: "edit", path: "ronne.yaml", content: "name: mine\n" });
    const edited = filesReducer(state, saved);
    expect(edited.files.find((f) => f.path === "ronne.yaml")).toMatchObject({
      content: "name: mine\n",
      dirty: true,
      loadedAt: T2,
    });
  });

  it("checks new paths", () => {
    const state = start();
    const words = (path: string, from?: string) => pathWords(newPathProblem(state, path, from));
    expect(newPathProblem(state, "prompt.md")).toEqual({ kind: "exists", path: "prompt.md" });
    expect(words("prompt.md")).toBe("There's already a file at prompt.md.");
    expect(newPathProblem(state, "../x")).toEqual({ kind: "path", problem: "outside" });
    expect(words("../x")).toBe('The path goes outside the item with "..".');
    expect(words("prompt.md/x")).toBe("A file can't be inside another file.");
    expect(newPathProblem(state, "docs/usage.md")).toBeNull();
    expect(words("other.yaml", "ronne.yaml")).toBe(
      "ronne.yaml can't be renamed: every item has one.",
    );
    // Uploading over a file is allowed, ronne.yaml included.
    expect(newPathProblem(state, "ronne.yaml", "ronne.yaml")).toBeNull();
  });
});

describe("file tree and languages", () => {
  it("shows each folder once, before its files", () => {
    const rows = treeRows([saved("a/b/c.md", ""), saved("a/d.md", ""), saved("z.md", "")]);
    expect(rows.map((r) => (r.kind === "folder" ? `${r.path}/` : r.file.path))).toEqual([
      "a/",
      "a/b/",
      "a/b/c.md",
      "a/d.md",
      "z.md",
    ]);
  });

  it("highlights by extension, and shell scripts by their shebang", () => {
    expect(languageFor("notes.txt", "plain")).toEqual([]);
    expect(languageFor("run", "#!/bin/sh\necho hi")).not.toEqual([]);
    expect(languageFor("ronne.yaml", "")).not.toEqual([]);
  });
});

const draft = (): Draft => ({
  id: "01J0000000000000000000000A",
  authorId: "u1",
  scope: { id: "s1", name: "platform" },
  workspace: { id: "00000000000000000000000000", name: "global" },
  name: "reviewer",
  type: "agent",
  status: "draft",
  createdAt: new Date(T1),
  updatedAt: new Date(T1),
  submittedAt: null,
  proposal: null,
  files: [
    {
      path: "logo.png",
      encoding: "base64",
      content: "iVBORw==",
      size: 4,
      executable: false,
      updatedAt: new Date(T1),
    },
    {
      path: "prompt.md",
      encoding: "utf8",
      content: "Hi",
      size: 2,
      executable: false,
      updatedAt: new Date(T1),
    },
    {
      path: "ronne.yaml",
      encoding: "utf8",
      content: "name: x\n",
      size: 8,
      executable: false,
      updatedAt: new Date(T1),
    },
  ],
});

describe("the draft page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the editor on ronne.yaml, with the files and the limits", async () => {
    drafts.viewSubmission.mockResolvedValue({ ...draft(), mine: true });
    const html = renderToStaticMarkup(
      await DraftPage({ params: Promise.resolve({ id: "01J0000000000000000000000A" }) }),
    );
    expect(html).toContain("@platform/reviewer");
    expect(html).toContain("3 of 500 files");
    expect(html).toContain("of 20 MB");
    for (const path of ["logo.png", "prompt.md", "ronne.yaml"]) expect(html).toContain(path);
    expect(html).toContain('aria-current="true"');
    expect(html).toMatch(/aria-current="true"[^>]*>.*ronne\.yaml/s);
  });

  it("checks what Submit would refuse on load, for your own editable draft only (#142)", async () => {
    const id = "01J0000000000000000000000A";
    drafts.viewSubmission.mockResolvedValue({ ...draft(), mine: true, member: true });
    await DraftPage({ params: Promise.resolve({ id }) });
    expect(saving.draftSubmitIssues).toHaveBeenCalledWith(expect.any(Headers), id);

    saving.draftSubmitIssues.mockClear();
    for (const shown of [
      { ...draft(), mine: false, member: true },
      { ...draft(), mine: true, member: false },
    ]) {
      drafts.viewSubmission.mockResolvedValue(shown);
      await DraftPage({ params: Promise.resolve({ id }) });
    }
    expect(saving.draftSubmitIssues).not.toHaveBeenCalled();
  });

  it("shows a blocked draft's problem when it opens, before any save (#142)", async () => {
    drafts.viewSubmission.mockResolvedValue({ ...draft(), mine: true, member: true });
    const before = renderToStaticMarkup(
      await DraftPage({ params: Promise.resolve({ id: "01J0000000000000000000000A" }) }),
    );
    saving.draftSubmitIssues.mockResolvedValueOnce([
      {
        severity: "error",
        code: "dependency_range",
        message: "No published version of @team/db matches ^9.0.0.",
        path: "/dependencies",
        file: "ronne.yaml",
      },
    ]);
    const after = renderToStaticMarkup(
      await DraftPage({ params: Promise.resolve({ id: "01J0000000000000000000000A" }) }),
    );
    const errors = (html: string) =>
      Number(/aria-label="Problems: (\d+) error/.exec(html)?.[1] ?? 0);
    expect(errors(after)).toBe(errors(before) + 1);
  });

  it("answers 404 for someone else's draft", async () => {
    drafts.viewSubmission.mockRejectedValue(new SubmissionNotFoundError());
    await expect(DraftPage({ params: Promise.resolve({ id: "x" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("shows a binary file's size and offers to replace it", () => {
    const html = renderToStaticMarkup(
      <DraftEditor
        draft={{
          id: "d",
          workspace: "global",
          scope: "platform",
          name: "reviewer",
          type: "agent",
          status: "draft",
          submittedAt: null,
          mine: true,
          readOnly: false,
          canSubmit: true,
          canWithdraw: true,
          versionsHref: null,
          proposal: null,
          files: [{ ...saved("logo.png", "iVBORw=="), encoding: "base64", size: 4 }],
        }}
      />,
    );
    expect(html).toContain("A binary file, 1 KB");
    expect(html).toContain(">Replace<");
  });

  const view = (overrides: Partial<Parameters<typeof DraftEditor>[0]["draft"]>) =>
    renderToStaticMarkup(
      <DraftEditor
        draft={{
          id: "d",
          workspace: "global",
          scope: "platform",
          name: "reviewer",
          type: "agent",
          status: "draft",
          submittedAt: null,
          mine: true,
          readOnly: false,
          canSubmit: true,
          canWithdraw: true,
          versionsHref: null,
          proposal: null,
          files: [saved("prompt.md", "Hi"), saved("ronne.yaml", "name: x\n")],
          ...overrides,
        }}
      />,
    );

  it("counts what Submit would refuse with 011's problems, each once, and leaves Submit to check (#142)", () => {
    const manifest =
      'name: "@platform/reviewer"\ntype: agent\ndescription: Reviews.\nagent:\n  prompt: prompt.md\n';
    const files = [saved("prompt.md", "Hi"), saved("ronne.yaml", manifest)];
    const clean = view({ files, submitIssues: [] });
    expect(clean).toContain('aria-label="Problems: No problems"');
    expect(clean).not.toContain("Show problems:");

    const range: ManifestIssue = {
      severity: "error",
      code: "dependency_range",
      message: "No published version of @team/db matches ^9.0.0.",
      path: "/dependencies",
      file: "ronne.yaml",
    };
    const blocked = view({ files, submitIssues: [range, { ...range }] });
    expect(blocked).toContain('aria-label="Problems: 1 error"');
    // In the file tree, beside ronne.yaml.
    expect(blocked).toContain('aria-label="Show problems: 1 error"');
    // Only 011's errors hold Submit: the registry may have changed, and Submit's dialog checks it.
    expect(blocked).not.toContain("Fix the error first.");
  });

  it("offers Submit for review and Withdraw on your own draft", () => {
    const html = view({});
    expect(html).toContain("Submit for review");
    expect(html).toContain("Withdraw");
    expect(html).toContain("</svg>Settings<");
  });

  it("offers Resubmit for review, and editing, when changes were requested", () => {
    const html = view({ status: "changes_requested" });
    expect(html).toContain("Resubmit for review");
    // Renaming and deleting are for drafts.
    expect(html).not.toContain("</svg>Settings<");
    expect(html).not.toMatch(/<fieldset disabled=""/);
  });

  it("tells an author no longer in the workspace why it's read-only (091)", () => {
    const html = view({ readOnly: true, canSubmit: false, notMemberOf: "acme" });
    expect(html).toContain("You&#x27;re no longer a member of acme.");
    // Ask to join opens the workspace's join page (094).
    expect(html).toMatch(
      /To work on it again, <a [^>]*href="\/workspaces\/acme\/join"[^>]*>Ask to join acme<\/a>/,
    );
    expect(html).not.toContain("Submitted for review");
    expect(html).not.toContain("Submit for review<");
  });

  it("shows a submitted submission read-only, with only Withdraw", () => {
    const html = view({
      status: "submitted",
      submittedAt: "2026-09-28T10:00:00.000Z",
      readOnly: true,
      canSubmit: false,
    });
    expect(html).toMatch(
      /Submitted for review(?:<!-- -->)? (?:<!-- -->)?on <time[^>]*>2026-09-28<\/time>\./,
    );
    expect(html).not.toContain("Submit for review<");
    expect(html).not.toContain("</svg>Settings<");
    expect(html).not.toContain(">Saved<");
    expect(html).toContain("Withdraw");
    // The form is disabled as a whole.
    expect(html).toMatch(/<fieldset disabled=""/);
  });

  it("shows someone else's submission, and a withdrawn one, with no actions", () => {
    const theirs = view({
      status: "submitted",
      mine: false,
      readOnly: true,
      canSubmit: false,
      canWithdraw: false,
    });
    expect(theirs).toContain("Someone else&#x27;s submission.");
    expect(theirs).not.toContain("Withdraw");
    const archived = view({
      status: "withdrawn",
      readOnly: true,
      canSubmit: false,
      canWithdraw: false,
      canRestore: true,
    });
    expect(archived).toContain("Archived.");
    expect(archived).toContain(">archived<");
    expect(archived).toContain("Restore it to edit and submit it again.");
    expect(archived).toContain(">Restore<");
    expect(archived).not.toContain("Delete for good");
    expect(archived).not.toContain("Withdraw");
  });

  it("says why it was sent back, with the reviewer's message, at the top (058)", () => {
    const html = view({
      status: "changes_requested",
      feedback: {
        kind: "request_changes",
        by: "Mo Moderator",
        at: T1,
        body: "Name the tabs rule.",
      },
    });
    expect(html).toContain("Changes requested by Mo Moderator");
    expect(html).toContain("Name the tabs rule.");
    expect(html).toContain("Edit the files, then Resubmit for review.");
    expect(html).toContain('href="/submissions/d?tab=conversation"');
  });

  it("says a rejection is final, with the reason, and not that it can be withdrawn (058)", () => {
    const html = view({
      status: "rejected",
      readOnly: true,
      canSubmit: false,
      canWithdraw: false,
      feedback: { kind: "reject", by: "Root", at: T1, body: "Duplicates @platform/lint." },
    });
    expect(html).toContain("Rejected by Root");
    expect(html).toContain("Duplicates @platform/lint.");
    expect(html).toContain("Rejected is final");
    expect(html).not.toContain("You can withdraw it");
    expect(html).not.toContain("Submitted for review");
  });

  it("gives each read-only status its own notice (058)", () => {
    const readOnly = { readOnly: true, canSubmit: false, canWithdraw: false };
    const approved = view({ status: "approved", ...readOnly });
    expect(approved).toContain("Approved.");
    expect(approved).toContain("Until then you can still withdraw it");
    const published = view({ status: "published", ...readOnly });
    expect(published).toContain("Released.");
    expect(published).not.toContain("You can withdraw it");
    expect(view({ status: "submitted", ...readOnly, canWithdraw: true })).toContain(
      "You can withdraw it until it&#x27;s released.",
    );
  });

  it("says an approval in your personal workspace was yours, without review (114)", () => {
    const html = view({
      status: "approved",
      readOnly: true,
      canSubmit: false,
      canWithdraw: true,
      selfApproved: true,
    });
    expect(html).toContain("Approved by you: personal workspaces aren&#x27;t reviewed.");
    expect(html).toContain("as a reviewer would have seen it");
    // Its helper (114) leads to the Documentation's section.
    expect(html).toContain("Why isn&#x27;t it reviewed?");
    expect(html).toContain("/marketplace/docs/workspaces#personal");
    expect(html).not.toContain("by you or a moderator");
  });

  it("offers deleting an archived one for good when no reviewer took part (057)", () => {
    const archived = view({
      status: "withdrawn",
      readOnly: true,
      canSubmit: false,
      canWithdraw: false,
      canRestore: true,
      canDelete: true,
    });
    expect(archived).toContain("Delete for good");
  });

  it("links a released item to its Versions page, and nothing else does", () => {
    const released = view({
      status: "published",
      readOnly: true,
      canSubmit: false,
      canWithdraw: false,
      versionsHref: "/items/platform/reviewer/versions",
    });
    expect(released).toMatch(
      /<a [^>]*href="\/items\/platform\/reviewer\/versions"[^>]*>.*View versions<\/a>/,
    );
    expect(view({})).not.toContain("View versions");
  });
});

describe("WithdrawDialog (057)", () => {
  const dialog = (canDelete: boolean, dependents = 0) =>
    renderToStaticMarkup(
      <WithdrawDialog
        draftId="d"
        itemName="@platform/reviewer"
        canDelete={canDelete}
        dependents={dependents}
        onClose={() => {}}
      />,
    );

  it("offers archiving, selected, and deleting for good", () => {
    const html = dialog(true);
    expect(html).toContain("Withdraw @platform/reviewer?");
    const radio = (value: string) =>
      html.match(new RegExp(`<input[^>]*value="${value}"[^>]*>`))?.[0];
    expect(radio("archive")).toContain('checked=""');
    expect(html).toContain("Find it under Archived, where you can restore it as a draft.");
    expect(html).toContain("This can&#x27;t be undone.");
    expect(radio("delete")).not.toContain('disabled=""');
    expect(html).toContain(">Archive</button>");
  });

  it("disables deleting, with the reason, once a reviewer took part", () => {
    const html = dialog(false, 2);
    expect(html.match(/<input[^>]*value="delete"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(html).toContain("Reviewers have commented on it or decided it. Archive it instead.");
    expect(html).toContain("2 submissions depend");
  });
});

describe("the Submit dialog's group (112)", () => {
  const member = (name: string, ready = true, extra: Partial<GroupMember> = {}): GroupMember => ({
    id: `id-${name}`,
    name,
    neededBy: ["@team/agent"],
    inCycle: false,
    ready,
    issues: [],
    ...extra,
  });

  it("names the button by how many drafts go with it", () => {
    expect(submitLabel(false, [])).toBe("Submit for review");
    expect(submitLabel(true, [])).toBe("Resubmit for review");
    // In your personal workspace (114) it's approved as it's sent: not "for review".
    expect(submitLabel(false, [], true)).toBe("Submit");
    expect(submitLabel(true, [], true)).toBe("Resubmit");
    expect(submitLabel(false, [member("@team/skill")])).toBe("Submit with 1 more draft");
    expect(submitLabel(true, [member("@team/a"), member("@team/b")])).toBe(
      "Resubmit with 2 more drafts",
    );
  });

  it("says why Submit is off: a draft that isn't ready, or the item's own errors", () => {
    const error = { severity: "error" as const, code: "x", message: "Broken." };
    expect(submitBlocked(null)).toBeNull();
    expect(
      submitBlocked({ ok: true, issues: [], members: [member("@team/a")], inCycle: false }),
    ).toBeNull();
    expect(
      submitBlocked({
        ok: true,
        issues: [],
        members: [member("@team/a"), member("@team/b", false)],
        inCycle: false,
      }),
    ).toBe("@team/b isn't ready: fix its errors first.");
    expect(submitBlocked({ ok: true, issues: [error], members: [], inCycle: false })).toBe(
      "Fix its errors first.",
    );
    expect(submitBlocked({ ok: false, error: "Not found.", issues: [] })).toBe("Not found.");
  });

  it("lists each draft with what needs it, a cycle, whether it's ready, and its problems", () => {
    const html = renderToStaticMarkup(
      <GroupList
        itemName="@team/agent"
        members={[
          member("@team/skill", true, { inCycle: true }),
          member("@team/rule", false, {
            neededBy: ["@team/agent", "@team/skill"],
            issues: [{ severity: "error", code: "schema", message: "The description is empty." }],
          }),
        ]}
      />,
    );
    expect(html).toContain("Goes with 2 of your drafts:");
    expect(html).toContain('aria-label="Drafts submitted with @team/agent"');
    expect(html).toContain('href="/submissions/id-@team/skill"');
    expect(html).toContain("needs each other");
    expect(html).toContain("Needed by @team/agent and @team/skill");
    expect(html.match(/>ready</g)).toHaveLength(1);
    expect(html).toContain(">not ready<");
    expect(html).toContain("The description is empty.");
    expect(html).toContain("Why do these go together?");
  });

  it("says what went for review: the item and the drafts with it", () => {
    const html = renderToStaticMarkup(
      <SubmitOutcome itemName="@team/agent" sent={["@team/skill", "@team/rule"]} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Submitted @team/agent for review, with @team/skill and @team/rule.");
  });

  it("shapes the service's group for the dialog: the others, what needs them, the cycle", () => {
    const of = (name: string): Draft => ({ ...draft(), id: `id-${name}`, name });
    const warning = { severity: "warning" as const, code: "w", message: "Heads up." };
    const preview = toPreview("id-agent", {
      members: [
        { id: "id-skill", result: "ready", submission: of("skill"), issues: [warning] },
        { id: "id-rule", result: "not_ready", submission: of("rule"), issues: [] },
        { id: "id-gone", result: "not_found" },
        { id: "id-agent", result: "ready", submission: of("agent"), issues: [warning] },
      ],
      neededBy: new Map([["id-rule", ["@platform/skill"]]]),
      cycles: [["id-skill", "id-agent"]],
    });
    expect(preview).toEqual({
      ok: true,
      issues: [warning],
      inCycle: true,
      members: [
        {
          id: "id-skill",
          name: "@platform/skill",
          neededBy: [],
          inCycle: true,
          ready: true,
          issues: [warning],
        },
        {
          id: "id-rule",
          name: "@platform/rule",
          neededBy: ["@platform/skill"],
          inCycle: false,
          ready: false,
          issues: [],
        },
      ],
    });
  });

  it("after Submit: refused, says so and checks again; sent along, says what; else closes", () => {
    expect(afterSubmit({ ok: false, error: "The draft has 1 problem…", issues: [] })).toEqual({
      next: "recheck",
    });
    expect(afterSubmit({ ok: true, issues: [], sent: ["@team/skill"] })).toEqual({
      next: "outcome",
      sent: ["@team/skill"],
    });
    expect(afterSubmit({ ok: true, issues: [], sent: [] })).toEqual({ next: "close" });
    expect(afterSubmit({ ok: true, issues: [] })).toEqual({ next: "close" });
  });
});

describe("the scan on a submitted item's page (137)", () => {
  const finished = {
    scan: {
      id: "01J0000000000000000000SCAN",
      revisionId: "r1",
      status: "done",
      attempts: 1,
      result: {
        scanner: "skillspector",
        scannerVersion: "2.13.2",
        analysis: "static",
        llmUnavailable: false,
        score: 90,
        severity: "HIGH",
        recommendation: "DO_NOT_INSTALL",
        complete: true,
        findings: [
          {
            rule: "P2",
            category: "Prompt Injection",
            severity: "HIGH",
            confidence: 0.9,
            title: "Hidden Instructions",
            explanation: null,
            remediation: "Remove it.",
            file: "SKILL.md",
            line: 3,
          },
        ],
        findingsOmitted: 0,
      },
      llm: null,
      error: null,
      queuedAt: new Date(T1),
      startedAt: new Date(T1),
      finishedAt: new Date(T1),
    },
    canRequest: false,
    dismissals: [],
    canDismiss: true,
  };
  const page = async (mine: boolean, query: Record<string, string> = {}) => {
    const submitted = { ...draft(), status: "submitted" as const };
    drafts.viewSubmission.mockResolvedValue({ ...submitted, mine, member: mine });
    review.getReview.mockResolvedValue({
      submission: { ...submitted, authorName: "Ada" },
      previous: null,
      changes: [],
      unreleased: [],
      issues: [],
      decisions: [],
      dependents: [],
      mine,
      revisions: [{ id: "r1", number: 1 }],
      current: { number: 1, files: [] },
      events: [],
      flags: [],
      published: [],
      proposal: null,
      gate: { blocked: true, by: "score", score: 90, threshold: 70 },
      can: { decide: false, override: false, comment: true, publish: false, sendBack: false },
    });
    // The server never lets an author mark their own submission's findings.
    scans.reviewScan.mockResolvedValue({ ...finished, canDismiss: !mine });
    return renderToStaticMarkup(
      await DraftPage({
        params: Promise.resolve({ id: "01J0000000000000000000000A" }),
        searchParams: Promise.resolve(query),
      }),
    );
  };
  const base = "/submissions/01J0000000000000000000000A";

  it("gives the author the review page's screen: its tabs, Overview first (137)", async () => {
    const html = await page(true);
    for (const [tab, label] of [
      ["", "Overview"],
      ["?tab=files", "Files (0)"],
      ["?tab=conversation", "Conversation (0)"],
      ["?tab=scan", "Security scan (1)"],
    ])
      expect(html).toContain(`href="${base}${tab}">${label}<`);
    expect(html).toMatch(/aria-current="page"[^>]*>Overview</);
    // The way back is My submissions, and nobody's decisions show on the author's page.
    expect(html).toContain('href="/submissions"');
    expect(html).not.toContain("What do these do?");
    // The card says what to do, and its findings are on their tab.
    expect(html).toContain("Change the files and send it again.");
    expect(html).toContain(`href="${base}?tab=scan"`);
    expect(html).not.toContain("Remove it.");
  });

  it("lists the author's findings on the Security scan tab, read-only", async () => {
    const html = await page(true, { tab: "scan" });
    expect(html).toContain("Remove it.");
    expect(html).not.toContain('aria-label="Mark false positive: ');
  });

  it("offers Edit files while the author may change it, and opens the editor with it", async () => {
    const asked = { ...draft(), status: "changes_requested" as const };
    drafts.viewSubmission.mockResolvedValue({ ...asked, mine: true, member: true });
    review.getReview.mockResolvedValue({
      submission: { ...asked, authorName: "Ada" },
      previous: null,
      changes: [],
      unreleased: [],
      issues: [],
      decisions: [],
      dependents: [],
      mine: true,
      revisions: [{ id: "r1", number: 1 }],
      current: { number: 1, files: [] },
      events: [],
      flags: [],
      published: [],
      proposal: null,
      gate: { blocked: false, by: null },
      can: { decide: false, override: false, comment: true, publish: false, sendBack: false },
    });
    scans.reviewScan.mockResolvedValue({ ...finished, scan: null });
    const render = async (query: Record<string, string>) =>
      renderToStaticMarkup(
        await DraftPage({
          params: Promise.resolve({ id: "01J0000000000000000000000A" }),
          searchParams: Promise.resolve(query),
        }),
      );
    const screen = await render({});
    expect(screen).toContain(`href="${base}?edit=1"`);
    expect(screen).toContain("Edit files");
    const editor = await render({ edit: "1" });
    expect(editor).toContain("Back to the submission");
    expect(editor).toContain("Resubmit for review");
    expect(editor).not.toContain(`href="${base}?tab=scan"`);
  });

  it("gives anyone else the screen without the author's view", async () => {
    const html = await page(false);
    expect(html).not.toContain("Change the files and send it again.");
    expect(html).not.toContain("Edit files");
  });
});

describe("the author's submission page: the review page's screen, the author's actions (137)", () => {
  beforeEach(() => vi.clearAllMocks());
  const ID = "01J0000000000000000000000A";
  const decision = (name: string, allowed: boolean) => ({
    decision: name,
    allowed,
    reason: allowed ? null : "Not yours to decide.",
    why: allowed ? null : { code: "own_decide" },
  });
  const open = async ({
    status = "submitted",
    mine = true,
    member = true,
    query = {},
    feedback = false,
    decisions = [],
    stale = false,
    proposal = false,
    events: given,
    publish = false,
    personal = false,
  }: {
    proposal?: boolean;
    /** The conversation, in place of the one feedback gives. */
    events?: { kind: string; body: string | null }[];
    publish?: boolean;
    /** In the author's own personal workspace (114). */
    personal?: boolean;
    status?: string;
    mine?: boolean;
    member?: boolean;
    query?: Record<string, string>;
    feedback?: boolean;
    decisions?: ReturnType<typeof decision>[];
    stale?: boolean;
  }) => {
    const base = draft();
    const submission = {
      ...base,
      workspace: personal ? { ...base.workspace, ownerId: base.authorId } : base.workspace,
      status,
      proposal: proposal
        ? { itemId: "i1", baseVersionId: "v1", baseVersion: "1.0.0", conflicts: [] }
        : null,
    };
    drafts.viewSubmission.mockResolvedValue({ ...submission, mine, member });
    const events = given
      ? given.map((e, i) => ({
          id: `e${i}`,
          ...e,
          actor: { id: "m", name: "Mo Moderator" },
          createdAt: new Date(T1),
        }))
      : feedback
        ? [
            {
              id: "e1",
              kind: "request_changes",
              body: "Name the tabs rule.",
              actor: { id: "m", name: "Mo Moderator" },
              createdAt: new Date(T1),
            },
          ]
        : [];
    review.getReview.mockResolvedValue({
      submission: { ...submission, authorName: "Ada" },
      mine,
      revisions: [{ id: "r1", number: 1 }],
      current: {
        number: 1,
        files: [
          {
            path: "SKILL.md",
            encoding: "utf8",
            content: "Check the layout.\n",
            size: 18,
            executable: false,
          },
        ],
      },
      previous: null,
      changes: [],
      unreleased: [],
      issues: [],
      events,
      flags: [],
      published: [],
      proposal: stale ? { baseVersion: "1.0.0", stale: "1.0.1", suggested: null } : null,
      decisions,
      dependents: [],
      gate: { blocked: false, by: null },
      can: { decide: false, override: false, comment: true, publish, sendBack: false },
    });
    scans.reviewScan.mockResolvedValue({
      scan: null,
      canRequest: false,
      dismissals: [],
      canDismiss: false,
    });
    return renderToStaticMarkup(
      await DraftPage({
        params: Promise.resolve({ id: ID }),
        searchParams: Promise.resolve(query),
      }),
    );
  };
  const isScreen = (html: string) => html.includes(`href="/submissions/${ID}?tab=files"`);
  const isEditor = (html: string) => html.includes("Back to the submission");

  it("opens the editor with ?edit=1 only while the author may change it", async () => {
    const edit = { edit: "1" };
    expect(isEditor(await open({ status: "changes_requested", query: edit }))).toBe(true);
    for (const shown of [
      { status: "submitted" },
      { status: "approved" },
      { status: "published" },
      { status: "rejected" },
      { status: "changes_requested", member: false },
      { status: "changes_requested", mine: false },
    ]) {
      const html = await open({ ...shown, query: edit });
      expect(isEditor(html), JSON.stringify(shown)).toBe(false);
      expect(isScreen(html), JSON.stringify(shown)).toBe(true);
    }
  });

  it("says why it can't be changed, or why it was sent back, above the tabs", async () => {
    expect(await open({})).toContain("Submitted for review");
    const sent = await open({ status: "changes_requested", feedback: true });
    expect(sent).toContain("Name the tabs rule.");
    expect(sent).toContain(`href="/submissions/${ID}?tab=conversation"`);
    // No longer a member: what they can do, and why it was sent back.
    const removed = await open({ status: "changes_requested", feedback: true, member: false });
    expect(removed).toContain("no longer a member");
    expect(removed).toContain("Name the tabs rule.");
    expect(removed).not.toContain("Edit files");
    expect(removed).not.toContain("Edit the files, then Resubmit for review.");
  });

  it("shows the author the files, the conversation and Publish, as a reviewer sees them", async () => {
    expect(await open({ query: { tab: "files" } })).toContain("Check the layout.");
    expect(
      await open({
        query: { tab: "conversation" },
        events: [{ kind: "comment", body: "Looks right." }],
      }),
    ).toContain("Looks right.");
    expect(await open({ status: "approved", publish: true })).toMatch(/>Publish</);
    expect(await open({ status: "approved" })).not.toMatch(/>Publish</);
  });

  it("tells a removed member only what's left to them, as its status allows", async () => {
    const submitted = await open({ member: false });
    expect(submitted).toContain("its moderators can still decide it");
    // Sent back: nobody decides it until it's resubmitted, which needs them back.
    const sent = await open({ status: "changes_requested", member: false });
    expect(sent).toContain("It&#x27;s back with you: you can read it and withdraw it");
    expect(sent).not.toContain("can still decide it");
    const approved = await open({ status: "approved", member: false });
    expect(approved).toContain(
      "It&#x27;s approved. You can read it and withdraw it, but not release it.",
    );
    expect(approved).not.toContain("can still decide it");
    // Approved, but out of date: nobody releases it before a rebase, member or not.
    const stale = await open({ status: "approved", member: false, proposal: true, stale: true });
    expect(stale).toContain(
      "it can&#x27;t be released until it&#x27;s rebased, which needs you back",
    );
    expect(stale).not.toContain("a moderator can still release it");
    const staleMine = await open({ status: "approved", proposal: true, stale: true });
    expect(staleMine).toContain(
      "It can&#x27;t be released until you rebase it onto the newer version.",
    );
    expect(staleMine).not.toContain("by you or a moderator");
    // Their draft, in the editor: not before any moderator.
    const own = await open({ status: "draft", member: false });
    expect(own).toContain("You can read it and withdraw it, but not change or submit it.");
    expect(own).not.toContain("can still decide it");
    const published = await open({ status: "published", member: false });
    expect(published).toContain("you can&#x27;t withdraw it. To propose a change,");
    expect(published).not.toContain("can still decide it");
    expect(published).not.toContain("You can read it and withdraw it");
  });

  it("tells a removed member a rejection is final", async () => {
    const html = await open({
      status: "rejected",
      member: false,
      events: [{ kind: "reject", body: "Out of scope." }],
    });
    // Final, once: a new draft there needs them back, so it says how.
    expect(html.match(/Rejected is final/g)?.length).toBe(1);
    expect(html).toContain("Rejected is final. To try again with a new draft,");
    expect(html).toContain("Ask to join global");
    expect(html).not.toContain("no longer a member");
    expect(html).not.toContain("can still decide it");
    const fr = await inLocaleAsync("fr", () =>
      open({ status: "rejected", member: false, events: [{ kind: "reject", body: "Out." }] }),
    );
    expect(fr).toContain("Un rejet est définitif. Pour réessayer avec un nouveau brouillon,");
    const member = await open({ status: "rejected", events: [{ kind: "reject", body: "Out." }] });
    expect(member).toContain("Rejected is final: start a new draft to try again.");
  });

  it("says an approval in the author's personal workspace was theirs, with its helper", async () => {
    const html = await open({
      status: "approved",
      personal: true,
      events: [{ kind: "self_approve", body: null }],
    });
    expect(html).toContain("Approved by you: personal workspaces aren&#x27;t reviewed.");
    expect(html).toContain("Why isn&#x27;t it reviewed?");
    expect(await open({ status: "approved", events: [{ kind: "approve", body: null }] })).toContain(
      "Approved.",
    );
    // The latest approval decides: root's override after their own isn't "by you".
    const overridden = await open({
      status: "approved",
      personal: true,
      events: [
        { kind: "self_approve", body: null },
        { kind: "override", body: "Root's call." },
        { kind: "comment", body: "Noted." },
      ],
    });
    expect(overridden).not.toContain("Approved by you");
    expect(overridden).toContain("Approved.");
    // Root's approval past the scan counts the same.
    const scanned = await open({
      status: "approved",
      personal: true,
      events: [
        { kind: "self_approve", body: null },
        { kind: "scan_override", body: "Reviewed by hand." },
      ],
    });
    expect(scanned).not.toContain("Approved by you");
  });

  it("gives someone else none of the author's notices", async () => {
    const other = await open({ mine: false, status: "changes_requested", feedback: true });
    expect(other).not.toContain("Someone else's submission.");
    expect(other).not.toContain("Name the tabs rule.");
    expect(other).not.toContain("Submitted for review");
  });

  it("says an out-of-date proposal approved by its author waits on a rebase, not ready", async () => {
    const html = await open({
      status: "approved",
      personal: true,
      proposal: true,
      stale: true,
      events: [{ kind: "self_approve", body: null }],
    });
    expect(html).toContain("It can&#x27;t be released until you rebase it onto the newer version.");
    expect(html).not.toContain("ready to release");
    // Nobody reviews it there: resubmitting approves it again.
    expect(html).toContain("and resubmitting it approves it again.");
    // Said once, by the notice under the bar.
    expect(html.match(/personal workspaces aren&#x27;t reviewed/g)?.length).toBe(1);
    expect(html).not.toContain("to be reviewed again");
    expect(await open({ status: "approved", proposal: true, stale: true })).toContain(
      "to be reviewed again",
    );
  });

  it("tells the author in a personal workspace that resubmitting approves it, on the page and in the editor", async () => {
    const rebased = {
      status: "changes_requested",
      personal: true,
      proposal: true,
      events: [{ kind: "rebase", body: "1.0.1" }],
    };
    for (const html of [await open(rebased), await open({ ...rebased, query: { edit: "1" } })]) {
      expect(html).toContain("Edit the files, then Resubmit: it&#x27;s approved again at once.");
      expect(html).not.toContain("Resubmit for review.");
    }
    expect(await open({ ...rebased, personal: false })).toContain(
      "Edit the files, then Resubmit for review.",
    );
  });

  it("says nothing of a rebase once the proposal is released or closed", async () => {
    for (const status of ["published", "rejected", "withdrawn"]) {
      for (const mine of [true, false]) {
        const html = await open({ status, mine, proposal: true, stale: true });
        expect(html, `${status} ${mine}`).not.toContain("has been released since this proposal");
        expect(html, `${status} ${mine}`).not.toContain("Rebase onto");
        // Nor the header's stale badge.
        expect(html, `${status} ${mine}`).not.toContain("has been released since: rebase first.");
      }
    }
  });

  it("calls an up-to-date approved proposal ready to release", async () => {
    proposals.proposalPanel.mockResolvedValueOnce({
      baseVersion: "1.0.0",
      stale: null,
      conflicts: [],
    });
    const html = await open({ status: "approved", proposal: true });
    expect(html).toContain("ready to release, by you or a moderator");
    expect(html).not.toContain("Rebase onto");
  });

  it("has the author's proposal bar, and says once that the proposal is out of date", async () => {
    const html = await open({ proposal: true, stale: true });
    expect(html).toContain("Rebase onto 1.0.1");
    expect(html).toContain("1.0.1 has been released since: rebase first.");
    expect(html.match(/1\.0\.1 has been released since this proposal started\./g)?.length).toBe(1);
  });

  it("keeps a draft its editor alone, with no tabs", async () => {
    const html = await open({ status: "draft" });
    expect(isScreen(html)).toBe(false);
    expect(html).toContain("Submit for review");
    expect(review.getReview).not.toHaveBeenCalled();
  });

  it("offers an archived one's Restore and Delete, and no Withdraw", async () => {
    const html = await open({ status: "withdrawn" });
    expect(html).toContain(">Restore<");
    expect(html).toContain("Delete for good");
    expect(html).not.toMatch(/>Withdraw</);
    expect(await open({})).toMatch(/>Withdraw</);
    // No longer a member: no Restore until they rejoin, and the way to.
    const removed = await open({ status: "withdrawn", member: false });
    expect(removed).not.toContain(">Restore<");
    expect(removed).not.toContain("Restore it to edit and submit it again.");
    expect(removed).toContain("no longer a member of global: to restore it,");
    expect(removed).toContain("Ask to join global");
    expect(removed).toContain("Delete for good");
  });

  it("shows only the decisions someone may make there, never a row of disabled ones", async () => {
    const theirs = await open({
      decisions: [decision("approve", false), decision("reject", false)],
    });
    expect(theirs).not.toContain("What do these do?");
    expect(theirs).not.toMatch(/>Approve</);
    const root = await open({
      decisions: [decision("approve", false), decision("override", true)],
    });
    expect(root).toContain("What do these do?");
    expect(root).not.toMatch(/>Approve</);
  });

  it("leads someone else back to Reviews, and tells them a proposal is out of date", async () => {
    const other = await open({ mine: false, stale: true });
    expect(other).toContain('href="/reviews"');
    expect(other).not.toContain('href="/submissions"');
    expect(other).toContain("1.0.1 has been released since this proposal started.");
    expect(other).toContain("approving it now would undo what 1.0.1 changed");
    // Approved already: the release is what waits.
    const approved = await open({ mine: false, status: "approved", stale: true });
    expect(approved).toContain("releasing it now would undo what 1.0.1 changed");
    expect(approved).not.toContain("approving it now");
    expect(await open({})).toContain('href="/submissions"');
  });
});
