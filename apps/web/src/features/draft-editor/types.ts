import type { ItemType, ManifestIssue } from "@ronneai/core";
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
