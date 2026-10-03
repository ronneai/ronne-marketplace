"use client";

import { formatBytes } from "@ronneai/core";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import type { RenderedMarkdown, ShownFile } from "./types";

const CodeEditor = dynamic(
  () => import("@/components/code/CodeEditor").then((module) => module.CodeEditor),
  { ssr: false },
);

const ignore = () => {};

/**
 * A text file as written, highlighted by its path, read-only. Until the editor loads (and on the
 * server) it is plain text, so the contents are there without it.
 */
export const Source = ({ path, text, line }: { path: string; text: string; line?: number }) => {
  const [ready, setReady] = useState(false);
  // One object per line, so the editor moves there once, not on every render.
  const goToLine = useMemo(() => (line ? { line, at: 0 } : null), [line]);
  useEffect(() => setReady(true), []);
  if (text.trim() === "") return <p className="p-4 text-sm text-muted">This file is empty.</p>;
  return ready ? (
    <div className="max-h-[70dvh] overflow-auto">
      <CodeEditor path={path} value={text} onChange={ignore} readOnly goToLine={goToLine} />
    </div>
  ) : (
    <pre className="max-h-[70dvh] overflow-auto p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words text-fg">
      {text}
    </pre>
  );
};

/** Markdown as the README shows it, with its frontmatter as a table above it. */
export const Rendered = ({ markdown }: { markdown: RenderedMarkdown }) => (
  <div className="grid gap-4 p-4">
    {markdown.frontmatter && markdown.frontmatter.length > 0 ? (
      <dl
        aria-label="Frontmatter"
        className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-control border border-hairline bg-canvas p-3 text-sm"
      >
        {markdown.frontmatter.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-mono text-xs text-muted">{key}</dt>
            <dd className="min-w-0 break-words text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    ) : null}
    {markdown.html.trim() === "" ? (
      <p className="text-sm text-muted">Nothing after the frontmatter.</p>
    ) : (
      <div
        className="markdown"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered on the server by renderMarkdown, which escapes raw HTML and filters URLs.
        dangerouslySetInnerHTML={{ __html: markdown.html }}
      />
    )}
  </div>
);

const Body = ({ file, line }: { file: ShownFile; line?: number }) => {
  if (file.kind === "binary")
    return <p className="p-4 text-sm text-muted">A binary file, not shown here.</p>;
  if (file.kind === "large")
    return (
      <p className="p-4 text-sm text-muted">
        Too large to show here ({formatBytes(file.size)}).{" "}
        <code className="font-mono">rmk install</code> gets it as released.
      </p>
    );
  if (!file.markdown || file.text.trim() === "")
    return <Source path={file.path} text={file.text} line={line} />;
  return (
    <div className="p-3">
      <Tabs
        // Opened at a line (a risk flag's): the source shows it.
        initial={line ? 1 : 0}
        tabs={[
          { label: "Rendered", content: <Rendered markdown={file.markdown} /> },
          {
            label: "Source",
            content: <Source path={file.path} text={file.text} line={line} />,
          },
        ]}
      />
    </div>
  );
};

/**
 * One released file (044): its path, size and whether it's executable, then its contents. Markdown
 * is rendered, with its source a tab away; other text is shown as written; binary and very large
 * files say why they aren't shown.
 */
export const FileContent = ({ file, line }: { file: ShownFile; line?: number }) => (
  <section
    aria-label={file.path}
    className="min-w-0 overflow-hidden rounded-panel border border-hairline bg-surface"
  >
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2">
      <h3 className="min-w-0 flex-1 font-mono text-sm font-semibold break-all text-fg">
        {file.path}
      </h3>
      {file.executable ? <Badge>executable</Badge> : null}
      <span className="font-mono text-xs text-muted">{formatBytes(file.size)}</span>
    </div>
    <Body file={file} line={line} />
  </section>
);
