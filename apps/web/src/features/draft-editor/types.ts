import type { ItemType, ManifestIssue } from "@ronneai/core";

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
  status: string;
  files: EditorFile[];
};

/** The files a save sends, with what was sent, so later edits stay unsaved. */
export type SentFile = { path: string; content: string; executable: boolean };

export type SaveResult =
  | { ok: true; saved: { path: string; loadedAt: string }[]; issues: ManifestIssue[] }
  | { ok: false; error: string; stale?: string[] };

export type ActionResult = { ok: true } | { ok: false; error: string };
