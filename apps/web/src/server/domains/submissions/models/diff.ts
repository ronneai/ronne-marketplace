import { structuredPatch } from "diff";
import type { RevisionFile } from "./review";

/** A file this big (in lines, on either side) isn't diffed; the page shows the file instead. */
export const DIFF_MAX_LINES = 2000;

export type DiffLine = {
  kind: "context" | "added" | "removed";
  text: string;
  /** Line numbers on each side; missing on the side a line doesn't exist on. */
  before?: number;
  after?: number;
};

export type DiffHunk = { lines: DiffLine[] };

export type FileChange = {
  path: string;
  status: "added" | "removed" | "changed";
  binary: boolean;
  sizeBefore?: number;
  sizeAfter?: number;
  /** The executable flag changed, whatever happened to the content. */
  executableChanged: boolean;
  /** Changed lines with 3 lines of context, or "too_large", or none for binary files. */
  hunks?: DiffHunk[] | "too_large";
};

const lineCount = (text: string) => text.split("\n").length;

const hunksOf = (before: string, after: string): DiffHunk[] | "too_large" => {
  if (lineCount(before) > DIFF_MAX_LINES || lineCount(after) > DIFF_MAX_LINES) return "too_large";
  const patch = structuredPatch("before", "after", before, after, "", "", { context: 3 });
  return patch.hunks.map((hunk) => {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    const lines: DiffLine[] = [];
    for (const raw of hunk.lines) {
      const text = raw.slice(1);
      if (raw.startsWith("+")) lines.push({ kind: "added", text, after: newLine++ });
      else if (raw.startsWith("-")) lines.push({ kind: "removed", text, before: oldLine++ });
      else if (raw.startsWith(" "))
        lines.push({ kind: "context", text, before: oldLine++, after: newLine++ });
      // "\\ No newline at end of file" markers carry no line.
    }
    return { lines };
  });
};

/**
 * What changed between two revisions (feature 014), file by file, in path order: added, removed
 * and changed files, with line diffs for text. Unchanged files aren't listed. `before` null means
 * there's nothing to compare with (a first revision): every file is added.
 */
export const diffRevisions = (
  before: readonly RevisionFile[] | null,
  after: readonly RevisionFile[],
): FileChange[] => {
  const old = new Map((before ?? []).map((file) => [file.path, file]));
  const now = new Map(after.map((file) => [file.path, file]));
  const paths = [...new Set([...old.keys(), ...now.keys()])].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const changes: FileChange[] = [];
  for (const path of paths) {
    const a = old.get(path);
    const b = now.get(path);
    const binary = (a?.encoding ?? b?.encoding) === "base64" || b?.encoding === "base64";
    if (a && b && a.content === b.content && a.encoding === b.encoding) {
      if (a.executable !== b.executable)
        changes.push({
          path,
          status: "changed",
          binary,
          sizeBefore: a.size,
          sizeAfter: b.size,
          executableChanged: true,
          hunks: binary ? undefined : [],
        });
      continue;
    }
    const status = !a ? "added" : !b ? "removed" : "changed";
    const text = (file: RevisionFile | undefined) =>
      file?.encoding === "utf8" ? file.content : "";
    changes.push({
      path,
      status,
      binary,
      sizeBefore: a?.size,
      sizeAfter: b?.size,
      executableChanged: Boolean(a && b && a.executable !== b.executable),
      hunks: binary ? undefined : hunksOf(text(a), text(b)),
    });
  }
  return changes;
};
