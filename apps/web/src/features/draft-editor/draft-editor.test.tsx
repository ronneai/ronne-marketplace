import type { ManifestIssue } from "@ronneai/core";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { treeRows } from "@/components/code/FileTree";
import { languageFor } from "@/components/code/languages";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import type { Draft } from "@/server/domains/submissions/models/submission";
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
}));
vi.mock("./actions", () => ({}));

const { DraftEditor } = await import("./DraftEditor");
const {
  afterSubmit,
  CHANGED_SINCE_CHECK,
  GroupList,
  SubmitOutcome,
  submitBlocked,
  submitLabel,
  WithdrawDialog,
} = await import("./SubmitDialogs");
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
    expect(newPathProblem(state, "prompt.md")).toBe("There's already a file at prompt.md.");
    expect(newPathProblem(state, "../x")).toContain("outside the item");
    expect(newPathProblem(state, "prompt.md/x")).toBe("A file can't be inside another file.");
    expect(newPathProblem(state, "docs/usage.md")).toBeNull();
    expect(newPathProblem(state, "other.yaml", "ronne.yaml")).toContain("can't be renamed");
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
    expect(html).toContain('href="#conversation"');
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
      message: CHANGED_SINCE_CHECK,
    });
    expect(afterSubmit({ ok: true, issues: [], sent: ["@team/skill"] })).toEqual({
      next: "outcome",
      sent: ["@team/skill"],
    });
    expect(afterSubmit({ ok: true, issues: [], sent: [] })).toEqual({ next: "close" });
    expect(afterSubmit({ ok: true, issues: [] })).toEqual({ next: "close" });
  });
});
