"use client";

import { FilesBrowser } from "@/components/files/FilesBrowser";
import { FileChanges } from "@/components/files/FileViews";
import type { ShownFile } from "@/components/files/types";
import { Badge } from "@/components/ui/Badge";
import type { FileChange } from "@/server/domains/submissions/models/diff";

const STATUS_TONE = { added: "accent", removed: "error", changed: "muted" } as const;

/**
 * The revision's files on the review page (058), as the item page shows a version's: a tree beside
 * the file selected, Markdown rendered, long files scrolling in their own frame. A risk flag's link
 * opens its file at its line.
 */
export const ReviewAllFiles = ({
  files,
  selected,
  line,
}: {
  files: readonly ShownFile[];
  selected: string;
  line?: number;
}) =>
  files.length === 0 ? (
    <p className="text-sm text-muted">No files.</p>
  ) : (
    <FilesBrowser files={files} selected={selected} line={line} label="Files of this revision" />
  );

type ChangedFile = { path: string; size: number; executable: boolean; change: FileChange };

/**
 * What changed (014, 017), as a tree of the changed files, each marked added, changed or removed,
 * beside the diff of the one selected, so many files or long diffs stay easy to go through.
 */
export const ReviewChanges = ({
  changes,
  selected,
  emptyText,
}: {
  changes: readonly FileChange[];
  selected?: string;
  emptyText: string;
}) => {
  if (changes.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  const files: ChangedFile[] = changes.map((change) => ({
    path: change.path,
    size: change.sizeAfter ?? change.sizeBefore ?? 0,
    executable: false,
    change,
  }));
  const initial = files.some((f) => f.path === selected)
    ? (selected ?? "")
    : (files[0]?.path ?? "");
  return (
    <FilesBrowser
      files={files}
      selected={initial}
      label="Changed files"
      after={(file) => (
        <Badge tone={STATUS_TONE[file.change.status]} className="mr-1 shrink-0">
          {file.change.status}
        </Badge>
      )}
      render={(file) => <FileChanges changes={[file.change]} since={null} />}
    />
  );
};
