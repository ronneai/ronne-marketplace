"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { useBytes } from "@/i18n/bytes";
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
  const t = useTranslations("author.files");
  const [ready, setReady] = useState(false);
  // One object per line, so the editor moves there once, not on every render.
  const goToLine = useMemo(() => (line ? { line, at: 0 } : null), [line]);
  useEffect(() => setReady(true), []);
  if (text.trim() === "") return <p className="p-4 text-sm text-muted">{t("empty")}</p>;
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
export const Rendered = ({ markdown }: { markdown: RenderedMarkdown }) => {
  const t = useTranslations("author.files");
  return (
    <div className="grid gap-4 p-4">
      {markdown.frontmatter && markdown.frontmatter.length > 0 ? (
        <dl
          aria-label={t("frontmatter")}
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
        <p className="text-sm text-muted">{t("nothingAfter")}</p>
      ) : (
        <div
          className="markdown"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: rendered on the server by renderMarkdown, which escapes raw HTML and filters URLs.
          dangerouslySetInnerHTML={{ __html: markdown.html }}
        />
      )}
    </div>
  );
};

const Body = ({ file, line }: { file: ShownFile; line?: number }) => {
  const t = useTranslations("author.files");
  const bytes = useBytes();
  if (file.kind === "binary") return <p className="p-4 text-sm text-muted">{t("binary")}</p>;
  if (file.kind === "large")
    return (
      <p className="p-4 text-sm text-muted">
        {t.rich("tooLarge", {
          size: bytes(file.size),
          mono: (chunks) => <code className="font-mono">{chunks}</code>,
        })}
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
          { label: t("rendered"), content: <Rendered markdown={file.markdown} /> },
          {
            label: t("source"),
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
export const FileContent = ({ file, line }: { file: ShownFile; line?: number }) => {
  const t = useTranslations("author.files");
  const bytes = useBytes();
  return (
    <section
      aria-label={file.path}
      className="min-w-0 overflow-hidden rounded-panel border border-hairline bg-surface"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2">
        <h3 className="min-w-0 flex-1 font-mono text-sm font-semibold break-all text-fg">
          {file.path}
        </h3>
        {file.executable ? <Badge>{t("executable")}</Badge> : null}
        <span className="font-mono text-xs text-muted">{bytes(file.size)}</span>
      </div>
      <Body file={file} line={line} />
    </section>
  );
};
