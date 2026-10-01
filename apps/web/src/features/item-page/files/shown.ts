import { parse } from "yaml";
import { renderMarkdown } from "@/components/markdown/render-markdown";
import type { ContentFile } from "@/server/domains/items/models/contents";
import type { RenderedMarkdown, ShownFile } from "./types";

const FENCE = "---";

/** One line of the text, from `from`, and where the next starts: no regular expressions (docs/knowledge/codeql-regex.md). */
const lineEnd = (text: string, from: number) => {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
};
const lineAt = (text: string, from: number) => {
  const end = lineEnd(text, from);
  const line = text.slice(from, end);
  return { line: line.endsWith("\r") ? line.slice(0, -1) : line, next: end + 1 };
};

/**
 * YAML frontmatter, as SKILL.md and agent prompts have it: `---` on the first line, up to the next
 * `---` line. Returns the YAML and the text after it, or null when there is none.
 */
export const splitFrontmatter = (text: string): { yaml: string; body: string } | null => {
  const first = lineAt(text, 0);
  if (first.line !== FENCE) return null;
  let at = first.next;
  while (at <= text.length) {
    const { line, next } = lineAt(text, at);
    if (line === FENCE) return { yaml: text.slice(first.next, at), body: text.slice(next) };
    at = next;
  }
  return null;
};

const shownValue = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

/**
 * A Markdown file's rendered view: its frontmatter as rows (none when it isn't a YAML map), and the
 * rest rendered safely as a README is (018), keeping each line break.
 */
export const renderMarkdownFile = (text: string): RenderedMarkdown => {
  const split = splitFrontmatter(text);
  if (!split) return { frontmatter: null, html: renderMarkdown(text, { breaks: true }) };
  let frontmatter: [string, string][] | null = null;
  try {
    const value: unknown = parse(split.yaml);
    if (value !== null && typeof value === "object" && !Array.isArray(value))
      frontmatter = Object.entries(value).map(([key, entry]) => [key, shownValue(entry)]);
  } catch {
    // Not YAML: no table; the Source view shows it as written.
  }
  return { frontmatter, html: renderMarkdown(split.body, { breaks: true }) };
};

export const isMarkdown = (path: string) => path.toLowerCase().endsWith(".md");

/** The version's files with Markdown rendered, for the Overview and Files tabs. */
export const showFiles = (files: readonly ContentFile[]): ShownFile[] =>
  files.map((file) =>
    file.kind === "text" && isMarkdown(file.path)
      ? { ...file, markdown: renderMarkdownFile(file.text) }
      : file,
  );

/** The file Files opens: `?file=` when the version has it, else the body file, else ronne.yaml. */
export const selectedFile = (
  files: readonly { path: string }[],
  requested: string | undefined,
  bodyPath: string | null,
): string => {
  const has = (path: string | null | undefined): path is string =>
    !!path && files.some((file) => file.path === path);
  if (has(requested)) return requested;
  if (has(bodyPath)) return bodyPath;
  return has("ronne.yaml") ? "ronne.yaml" : (files[0]?.path ?? "");
};
