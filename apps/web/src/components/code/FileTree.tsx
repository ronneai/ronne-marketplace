"use client";

import { formatBytes } from "@ronneai/core";
import { FileText, Folder, Terminal } from "lucide-react";
import type { ReactNode } from "react";

/** What the tree shows of a file: an editor's file, or a released one (044). */
export type TreeFile = { path: string; size: number; executable: boolean; dirty?: boolean };

type Row<F extends TreeFile> =
  | { kind: "folder"; path: string; depth: number }
  | { kind: "file"; file: F; depth: number };

/** Files in path order, with a row for each folder the first time it appears. */
export const treeRows = <F extends TreeFile>(files: readonly F[]): Row<F>[] => {
  const rows: Row<F>[] = [];
  const shown = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join("/");
      if (shown.has(folder)) continue;
      shown.add(folder);
      rows.push({ kind: "folder", path: folder, depth: i - 1 });
    }
    rows.push({ kind: "file", file, depth: parts.length - 1 });
  }
  return rows;
};

/** A list of files as a tree, with their sizes and unsaved marks: the draft editor (012), the item page (044). */
export const FileTree = <F extends TreeFile>({
  files,
  selected,
  onSelect,
  after,
}: {
  files: readonly F[];
  selected: string;
  onSelect: (path: string) => void;
  /** Shown after a file's row, outside its button: such as its problems' icon (the editor). */
  after?: (file: F) => ReactNode;
}) => (
  <ul aria-label="Files" className="grid gap-0.5">
    {treeRows(files).map((row) =>
      row.kind === "folder" ? (
        <li
          key={`folder:${row.path}`}
          className="flex items-center gap-1.5 px-2 py-1 font-mono text-xs text-muted"
          style={{ paddingLeft: `${0.5 + row.depth * 0.875}rem` }}
        >
          <Folder size={14} aria-hidden="true" />
          {row.path.slice(row.path.lastIndexOf("/") + 1)}/
        </li>
      ) : (
        <li
          key={row.file.path}
          className="flex items-center gap-1 rounded-control pr-2 font-mono text-xs hover:bg-tint has-[[aria-current=true]]:bg-tint"
          style={{ paddingLeft: `${0.5 + row.depth * 0.875}rem` }}
        >
          <button
            type="button"
            onClick={() => onSelect(row.file.path)}
            aria-current={row.file.path === selected ? "true" : undefined}
            className="flex min-w-0 items-center gap-1.5 rounded-control py-1 text-left text-fg aria-[current=true]:font-semibold outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
          >
            {row.file.executable ? (
              <Terminal size={14} aria-label="Executable" role="img" className="shrink-0" />
            ) : (
              <FileText size={14} aria-hidden="true" className="shrink-0" />
            )}
            <span className="min-w-0 truncate">
              {row.file.path.slice(row.file.path.lastIndexOf("/") + 1)}
            </span>
            {row.file.dirty ? (
              <>
                <span aria-hidden="true">●</span>
                <span className="sr-only">(unsaved)</span>
              </>
            ) : null}
          </button>
          {/* Right after the name, such as its problems' icon (the editor, 2026-10-01). */}
          {after?.(row.file)}
          <span className="ml-auto shrink-0 pl-2 text-muted">{formatBytes(row.file.size)}</span>
        </li>
      ),
    )}
  </ul>
);
