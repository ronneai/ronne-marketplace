"use client";

import { formatBytes } from "@ronneai/core";
import { FileText, Folder, Terminal } from "lucide-react";

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
export const FileTree = ({
  files,
  selected,
  onSelect,
}: {
  files: readonly TreeFile[];
  selected: string;
  onSelect: (path: string) => void;
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
        <li key={row.file.path}>
          <button
            type="button"
            onClick={() => onSelect(row.file.path)}
            aria-current={row.file.path === selected ? "true" : undefined}
            className="flex w-full items-center gap-1.5 rounded-control px-2 py-1 text-left font-mono text-xs text-fg hover:bg-tint aria-[current=true]:bg-tint aria-[current=true]:font-semibold outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
            style={{ paddingLeft: `${0.5 + row.depth * 0.875}rem` }}
          >
            {row.file.executable ? (
              <Terminal size={14} aria-label="Executable" role="img" />
            ) : (
              <FileText size={14} aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {row.file.path.slice(row.file.path.lastIndexOf("/") + 1)}
            </span>
            {row.file.dirty ? (
              <>
                <span aria-hidden="true">●</span>
                <span className="sr-only">(unsaved)</span>
              </>
            ) : null}
            <span className="shrink-0 text-muted">{formatBytes(row.file.size)}</span>
          </button>
        </li>
      ),
    )}
  </ul>
);
