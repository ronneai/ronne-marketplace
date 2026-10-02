"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { FileTree, type TreeFile } from "@/components/code/FileTree";
import { FileContent } from "./FileContent";
import type { ShownFile } from "./types";

/**
 * Files as a tree beside the one selected: the item page's Files tab (044), and the review page's
 * files and changes (058). The selection is kept in `?file=`, so a file can be linked; the server
 * picks it on load. `?line=` opens the first file at a line (a risk flag's), until another is picked.
 */
export const FilesBrowser = <F extends TreeFile = ShownFile>({
  files,
  selected: initial,
  line,
  label = "Files of this version",
  after,
  render,
}: {
  files: readonly F[];
  selected: string;
  /** The line to open the initially selected file at. */
  line?: number;
  label?: string;
  /** Shown after a file's name in the tree, such as whether it was added or changed. */
  after?: (file: F) => ReactNode;
  /** How a file is shown; a released file's contents by default. */
  render?: (file: F, line: number | undefined) => ReactNode;
}) => {
  const [selected, setSelected] = useState(initial);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const file = files.find((f) => f.path === selected);
  const select = (path: string) => {
    setSelected(path);
    const next = new URLSearchParams(params.toString());
    next.set("file", path);
    next.delete("line");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const atLine = selected === initial ? line : undefined;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] md:items-start">
      <nav
        aria-label={label}
        className="rounded-panel border border-hairline bg-surface p-2 md:sticky md:top-4"
      >
        <FileTree files={files} selected={selected} onSelect={select} after={after} />
      </nav>
      {file ? (
        render ? (
          render(file, atLine)
        ) : (
          <FileContent file={file as unknown as ShownFile} line={atLine} />
        )
      ) : null}
    </div>
  );
};
