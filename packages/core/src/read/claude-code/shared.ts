import { stringify } from "yaml";
import { parseFrontmatter } from "../../frontmatter.js";
import type { Manifest } from "../../manifest.js";
import { parseItemName } from "../../names.js";
import type { PackageFile } from "../../package-file.js";
import { MODELS, TOOLS } from "../../render/claude-code/mappings.js";
import { firstLine, fitDescription } from "../text.js";
import { ReadError, type ReadResult, type ReadWarning } from "../types.js";

/**
 * What the Claude Code readers share (feature 040, native-readers.md §5–8). The tool and model tables
 * are the renderer's, reversed here, so the two directions can't drift.
 */

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export const textOf = (file: PackageFile) => decoder.decode(file.bytes);

/** Claude Code's tool names → the canonical ones: `Read` → `read`, `Bash` → `shell`. */
const CANONICAL_TOOLS = new Map(
  Object.entries(TOOLS.names).map(([canonical, native]) => [native as string, canonical]),
);

/**
 * A Claude Code tool as a canonical one, or null when Ronne has no name for it. `mcp__s__t` is
 * `mcp:s/t`, and `mcp__s` (every tool of a server) is `mcp:s`.
 */
export const canonicalTool = (native: string): string | null => {
  const mcp = /^mcp__([a-z0-9-]+)(?:__([A-Za-z0-9_-]+))?$/.exec(native);
  if (mcp) return mcp[2] ? `mcp:${mcp[1]}/${mcp[2]}` : `mcp:${mcp[1]}`;
  return CANONICAL_TOOLS.get(native) ?? null;
};

/** The server a tool belongs to, for `references`: `mcp__github__search` → `github`. */
export const mcpServerOf = (native: string): string | null =>
  /^mcp__([a-z0-9-]+)(?:__|$)/.exec(native)?.[1] ?? null;

/** Claude Code's models → the manifest's: an alias, or a full id that names the same family. */
export const canonicalModel = (native: string): "fast" | "strong" | null => {
  for (const [canonical, alias] of Object.entries(MODELS))
    if (alias && (native === alias || native.includes(alias)))
      return canonical as "fast" | "strong";
  return null;
};

/**
 * A frontmatter value that may be a YAML list or a comma- (or space-) separated string. Parts are
 * trimmed after splitting on a plain separator: a pattern such as `\s*,\s*` runs in quadratic
 * time on long runs of spaces (docs/knowledge/codeql-regex.md).
 */
export const listOf = (value: unknown, separator: string | RegExp = ","): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string")
    return value
      .split(separator)
      .map((v) => v.trim())
      .filter(Boolean);
  return [];
};

/**
 * A Markdown file's frontmatter and body. The body loses the blank lines after the frontmatter and
 * ends with one newline, as the renderer writes it.
 */
export const splitMarkdown = (text: string) => {
  const { data, yaml, body } = parseFrontmatter(text);
  let start = 0;
  while (body[start] === "\n" || body[start] === "\r") start += 1;
  let end = body.length;
  while (end > start && (body[end - 1] === "\n" || body[end - 1] === "\r")) end -= 1;
  const trimmed = body.slice(start, end);
  return { data, yaml, body: trimmed ? `${trimmed}\n` : "" };
};

/** One warning per native field the manifest can't carry, each naming it. */
export const droppedFields = (
  data: Record<string, unknown> | null,
  kept: readonly string[],
  file: string,
  what: string,
): ReadWarning[] =>
  Object.keys(data ?? {})
    .filter((key) => !kept.includes(key))
    .map((key) => ({
      code: "field_dropped" as const,
      message: `${file}'s \`${key}\` was left out: a ${what} in Ronne has no such setting.`,
      file,
    }));

/**
 * The description, on one line and at most 300 characters; from the frontmatter, or the body's first
 * line when `fromBody` allows it. Unlike a skill's, a cut description isn't kept whole anywhere.
 */
export const descriptionOf = (
  front: unknown,
  body: string,
  file: string,
  fromBody: boolean,
): { description: string | null; warnings: ReadWarning[] } => {
  const warnings: ReadWarning[] = [];
  let text = typeof front === "string" ? front : "";
  if (!text.trim() && fromBody) {
    text = firstLine(body);
    if (text)
      warnings.push({
        code: "description_from_body",
        message: `${file} has no description, so its first line is used.`,
        file,
      });
  }
  if (!text.trim()) return { description: null, warnings };
  const fitted = fitDescription(text);
  if (fitted.cut)
    warnings.push({
      code: "description_cut",
      message: `The description is longer than 300 characters, so it was cut short; the item keeps only the cut text, and it's what Claude Code will read when the item is installed.`,
      file: "ronne.yaml",
    });
  return { description: fitted.text, warnings };
};

/** `@scope/name`, checked; the readers take the name the person chose. */
export const checkedName = (itemName: string) => {
  const parsed = parseItemName(itemName);
  if (!parsed) throw new ReadError("invalid_name", `${itemName} isn't an item name (@scope/name).`);
  return parsed;
};

/** The result: `ronne.yaml` written from the manifest, and the other files, by path. */
export const result = (
  manifest: Manifest,
  files: { path: string; text: string }[],
  warnings: ReadWarning[],
  references: ReadResult["references"],
): ReadResult => {
  const manifestText = stringify(manifest, { lineWidth: 0 });
  return {
    manifest,
    manifestText,
    files: [{ path: "ronne.yaml", text: manifestText }, ...files]
      .map((f) => ({ path: f.path, bytes: encoder.encode(f.text) }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    warnings,
    references,
  };
};
