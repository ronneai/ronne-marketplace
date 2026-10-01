"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FileTree } from "@/components/code/FileTree";
import { FileContent } from "./FileContent";
import type { ShownFile } from "./types";

/**
 * The Files tab (044): the version's files as a tree beside the one selected. The selection is
 * kept in `?file=`, so a file can be linked; the server picks it on load (`selectedFile`).
 */
export const FilesBrowser = ({
  files,
  selected: initial,
}: {
  files: readonly ShownFile[];
  selected: string;
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
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] md:items-start">
      <nav
        aria-label="Files of this version"
        className="rounded-panel border border-hairline bg-surface p-2 md:sticky md:top-4"
      >
        <FileTree files={files} selected={selected} onSelect={select} />
      </nav>
      {file ? <FileContent file={file} /> : null}
    </div>
  );
};
