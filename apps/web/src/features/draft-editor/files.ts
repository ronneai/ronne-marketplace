import { pathProblem } from "@ronneai/core";
import { byteSize, MANIFEST_PATH } from "@/server/domains/submissions/models/submission";
import type { EditorFile } from "./types";

/**
 * The editor's files (feature 012), as a pure reducer. `removed` are saved files that were deleted
 * or renamed away, with the `loadedAt` the server needs to check they didn't change since.
 */
export type FilesState = { files: EditorFile[]; removed: { path: string; loadedAt: string }[] };

export type FilesAction =
  | { type: "edit"; path: string; content: string }
  | { type: "put"; path: string; encoding: "utf8" | "base64"; content: string }
  | { type: "rename"; from: string; to: string }
  | { type: "remove"; path: string }
  | { type: "executable"; path: string; executable: boolean }
  | {
      type: "saved";
      saved: { path: string; loadedAt: string }[];
      sent: { path: string; content: string; executable: boolean }[];
      removed: string[];
      /** Files the save changed itself (097), with what it wrote. */
      rewritten?: { path: string; content: string }[];
    };

const byPath = (a: { path: string }, b: { path: string }) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/** A new file at `path` picks up the `loadedAt` of a saved file removed from there. */
const reclaim = (state: FilesState, path: string) => {
  const earlier = state.removed.find((file) => file.path === path);
  return {
    loadedAt: earlier?.loadedAt ?? null,
    removed: state.removed.filter((file) => file.path !== path),
  };
};

const update = (state: FilesState, path: string, change: (file: EditorFile) => EditorFile) => ({
  ...state,
  files: state.files.map((file) => (file.path === path ? change(file) : file)),
});

export const filesReducer = (state: FilesState, action: FilesAction): FilesState => {
  switch (action.type) {
    case "edit":
      // The same text is no edit: the editor echoes a change made from outside it, such as a
      // save's rewrite (097) or the form, and that mustn't mark the file unsaved.
      return update(state, action.path, (file) =>
        file.content === action.content
          ? file
          : {
              ...file,
              content: action.content,
              size: byteSize({ encoding: file.encoding, content: action.content }),
              dirty: true,
            },
      );
    case "put": {
      const size = byteSize(action);
      if (state.files.some((file) => file.path === action.path))
        return update(state, action.path, (file) => ({
          ...file,
          encoding: action.encoding,
          content: action.content,
          size,
          dirty: true,
        }));
      const { loadedAt, removed } = reclaim(state, action.path);
      const created: EditorFile = {
        path: action.path,
        encoding: action.encoding,
        content: action.content,
        size,
        executable: false,
        loadedAt,
        dirty: true,
      };
      return { files: [...state.files, created].sort(byPath), removed };
    }
    case "rename": {
      const file = state.files.find((f) => f.path === action.from);
      if (!file || action.from === action.to) return state;
      const gone = file.loadedAt ? [{ path: file.path, loadedAt: file.loadedAt }] : [];
      const { loadedAt, removed } = reclaim(
        { ...state, removed: [...state.removed, ...gone] },
        action.to,
      );
      return {
        files: [
          ...state.files.filter((f) => f.path !== action.from),
          { ...file, path: action.to, loadedAt, dirty: true },
        ].sort(byPath),
        removed,
      };
    }
    case "remove": {
      const file = state.files.find((f) => f.path === action.path);
      if (!file) return state;
      return {
        files: state.files.filter((f) => f.path !== action.path),
        removed: file.loadedAt
          ? [...state.removed, { path: file.path, loadedAt: file.loadedAt }]
          : state.removed,
      };
    }
    case "executable":
      return update(state, action.path, (file) => ({
        ...file,
        executable: action.executable,
        dirty: true,
      }));
    case "saved": {
      const loadedAt = new Map(action.saved.map((file) => [file.path, file.loadedAt]));
      const sent = new Map(action.sent.map((file) => [file.path, file]));
      const rewritten = new Map((action.rewritten ?? []).map((file) => [file.path, file.content]));
      return {
        files: state.files.map((file) => {
          const saved = loadedAt.get(file.path);
          if (!saved) return file;
          const what = sent.get(file.path);
          // Edited again while the save was on its way: still unsaved, but no longer stale.
          const unchanged = what
            ? what.content === file.content && what.executable === file.executable
            : !file.dirty;
          // The save rewrote it (097): show what was saved, unless it was edited meanwhile.
          const content = rewritten.get(file.path);
          if (content !== undefined && unchanged)
            return { ...file, content, loadedAt: saved, dirty: false };
          return { ...file, loadedAt: saved, dirty: file.dirty && !unchanged };
        }),
        removed: state.removed.filter((file) => !action.removed.includes(file.path)),
      };
    }
  }
};

/** What a save sends: every changed file, and every saved file that's gone. */
export const changesOf = (state: FilesState) => ({
  writes: state.files
    .filter((file) => file.dirty)
    .map(({ path, encoding, content, executable, loadedAt }) => ({
      path,
      encoding,
      content,
      executable,
      loadedAt,
    })),
  deletes: state.removed,
});

export const isDirty = (state: FilesState) =>
  state.removed.length > 0 || state.files.some((file) => file.dirty);

/** Why a new or renamed file can't have this path, or null. */
export const newPathProblem = (state: FilesState, path: string, from?: string): string | null => {
  if (from === MANIFEST_PATH && path !== MANIFEST_PATH)
    return "ronne.yaml can't be renamed: every item has one.";
  const problem = pathProblem(path);
  if (problem) return `The path ${problem}.`;
  if (path !== from && state.files.some((file) => file.path === path))
    return `There's already a file at ${path}.`;
  if (state.files.some((file) => file.path.startsWith(`${path}/`))) return `${path} is a folder.`;
  if (state.files.some((file) => path.startsWith(`${file.path}/`)))
    return "A file can't be inside another file.";
  return null;
};

export const totalsOf = (files: readonly { size: number }[]) => ({
  count: files.length,
  bytes: files.reduce((sum, file) => sum + file.size, 0),
});
