import type { ItemType, ManifestIssue } from "@ronneai/core";
import type { DependencyMark } from "@/server/domains/submissions/actions/submissions";
import type { FileChange } from "@/server/domains/submissions/models/diff";
import type { SubmissionStatus } from "@/server/domains/submissions/models/status";

/** A draft's file in the editor. `loadedAt` is the server's `updatedAt` for it, or null if it's new. */
export type EditorFile = {
  path: string;
  encoding: "utf8" | "base64";
  content: string;
  size: number;
  executable: boolean;
  loadedAt: string | null;
  dirty: boolean;
};

/** A draft as the page hands it to the editor: plain data, dates as ISO strings. */
export type EditorDraft = {
  id: string;
  scope: string;
  name: string;
  type: ItemType;
  status: SubmissionStatus;
  submittedAt: string | null;
  files: EditorFile[];
  /** Whether the viewer is the author. Moderators and root may view others' submissions (013). */
  mine: boolean;
  /** Not a draft, or not the viewer's: shown, but not editable (feature 013). */
  readOnly: boolean;
  canSubmit: boolean;
  canWithdraw: boolean;
  /** Whether the author can delete it for good (057): no reviewer has taken part. */
  canDelete?: boolean;
  /** Archived and the viewer's: it can come back as a draft (057). */
  canRestore?: boolean;
  /**
   * Why it was sent back or closed (058): the latest request for changes, rejection or rebase, for
   * the notice at the top. Only for `changes_requested` and `rejected`.
   */
  feedback?: {
    kind: "request_changes" | "reject" | "rebase";
    by: string;
    at: string;
    body: string | null;
  } | null;
  /** What each dependency waits on (056), shown beside its name in the form. */
  dependencyMarks?: DependencyMark[];
  /** How many open submissions depend on it (056): withdrawing leaves them blocked. */
  dependents?: number;
  /** The item's Versions page, once it has a published version (feature 016). */
  versionsHref: string | null;
  /** For a change proposal (feature 017); null for a new item. */
  proposal: EditorProposal | null;
};

/** What the editor shows about a change proposal (017). */
export type EditorProposal = {
  /** `@scope/name`, and its page showing the base version. */
  itemName: string;
  baseVersion: string;
  baseHref: string;
  /** The newer version it has to be rebased onto, or null. */
  stale: string | null;
  canRebase: boolean;
  canResolve: boolean;
  /** Files the last rebase left in conflict, each with its base version against the author's. */
  conflicts: { path: string; change: FileChange | null }[];
};

/** The files a save sends, with what was sent, so later edits stay unsaved. */
export type SentFile = { path: string; content: string; executable: boolean };

export type SaveResult =
  | { ok: true; saved: { path: string; loadedAt: string }[]; issues: ManifestIssue[] }
  | { ok: false; error: string; stale?: string[] };

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Submit and its preview: the checks' issues, and whether it went through. */
export type SubmitResult =
  | { ok: true; issues: ManifestIssue[] }
  | { ok: false; error: string; issues: ManifestIssue[] };
