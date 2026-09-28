import type { Manifest } from "../manifest.js";
import { sha256Hex } from "../pack/pack.js";
import type { Change, ChangeFile, RenderWarning } from "./types.js";

/** What every renderer shares (feature 021): markers, sections, hashes, names and references. */

export type CommentSyntax = "html" | "hash" | "slashes";

const COMMENT: Record<CommentSyntax, (text: string) => string> = {
  html: (text) => `<!-- ${text} -->`,
  hash: (text) => `# ${text}`,
  slashes: (text) => `// ${text}`,
};

/** The line that marks a generated file as rmk's, where the file's syntax allows a comment. */
export const managedMarker = (item: string, version: string, syntax: CommentSyntax): string =>
  COMMENT[syntax](`managed by rmk: ${item}@${version}`);

export const sectionBegin = (item: string) => `<!-- rmk:begin ${item} -->`;
export const sectionEnd = (item: string) => `<!-- rmk:end ${item} -->`;

/** `text` without its trailing newlines; a loop rather than a regex, which CodeQL flags as slow. */
export const trimTrailingNewlines = (text: string): string => {
  let end = text.length;
  while (end > 0 && text[end - 1] === "\n") end -= 1;
  return text.slice(0, end);
};

/** A fenced block for one item inside a shared Markdown file such as `AGENTS.md`. */
export const section = (item: string, text: string): string =>
  `${sectionBegin(item)}\n${trimTrailingNewlines(text)}\n${sectionEnd(item)}\n`;

/** JSON with sorted keys and no whitespace: the same value always hashes the same. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );

const encoder = new TextEncoder();
const bytesOf = (content: Uint8Array | string) =>
  typeof content === "string" ? encoder.encode(content) : content;

const fileHash = (file: ChangeFile) => sha256Hex(bytesOf(file.content));

/**
 * What `.rmk/state.json` stores for a change (cli-files.md): a file's bytes; a folder's sorted
 * paths with their hashes and executable bits; the canonical JSON of a key's value or an array
 * element; the text between a section's fences.
 */
export const stateHash = async (change: Change): Promise<string> => {
  switch (change.kind) {
    case "file":
      return sha256Hex(bytesOf(change.content));
    case "dir": {
      const lines = await Promise.all(
        [...change.files]
          .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
          .map(async (file) => `${file.path}\0${await fileHash(file)}\0${file.executable ? 1 : 0}`),
      );
      return sha256Hex(encoder.encode(lines.join("\n")));
    }
    case "json-key":
    case "toml-key":
      return sha256Hex(encoder.encode(canonicalJson(change.value)));
    case "json-array-item":
      return sha256Hex(encoder.encode(canonicalJson(change.item)));
    case "section":
      // As it sits between the fences: one trailing newline, however many were given.
      return sha256Hex(encoder.encode(`${trimTrailingNewlines(change.text)}\n`));
  }
};

/**
 * A tool's own name for a canonical one (manifest spec §5). `mcp:<server>` and
 * `mcp:<server>/<tool>` go through `mcp`; anything the table lacks is an `unmapped_tool` warning.
 */
export type ToolTable = {
  names: Partial<Record<string, string>>;
  mcp: (server: string, tool?: string) => string;
};

export const toolName = (
  canonical: string,
  table: ToolTable,
): { name: string } | { warning: RenderWarning } => {
  const mcp = /^mcp:([^/]+)(?:\/(.+))?$/.exec(canonical);
  if (mcp) return { name: table.mcp(mcp[1] ?? "", mcp[2]) };
  const name = table.names[canonical];
  return name
    ? { name }
    : {
        warning: {
          code: "unmapped_tool",
          message: `The tool \`${canonical}\` has no equivalent here, so it was left out.`,
        },
      };
};

export type EnvSyntax = "shell" | "json-template";

/** A reference to an environment variable, never its value (MVP §4.3). */
export const envRef = (name: string, syntax: EnvSyntax): string =>
  syntax === "shell" ? `$${name}` : `\${${name}}`;

/**
 * What the manifest says about one renderer (manifest spec §4): whether the item is offered to it,
 * and the renderer-specific overrides, which the renderer validates.
 */
export const targetsFor = (
  manifest: Manifest,
  rendererId: string,
): { enabled: boolean; overrides: Record<string, unknown> } => {
  const targets = manifest.targets;
  const target =
    targets && typeof targets === "object" && !Array.isArray(targets)
      ? (targets as Record<string, unknown>)[rendererId]
      : undefined;
  const block =
    target && typeof target === "object" && !Array.isArray(target)
      ? (target as Record<string, unknown>)
      : {};
  const overrides = block.overrides;
  return {
    enabled: block.enabled !== false,
    overrides:
      overrides && typeof overrides === "object" && !Array.isArray(overrides)
        ? (overrides as Record<string, unknown>)
        : {},
  };
};

/** The warning for an item the manifest keeps away from this renderer. */
export const disabledWarning = (item: string, rendererName: string): RenderWarning => ({
  code: "disabled_by_manifest",
  message: `${item} isn't offered for ${rendererName}: its manifest turns that target off.`,
});

/**
 * Why a path can't be written, or null: renderers write only inside the project (or home) folder,
 * with `/` separators.
 */
export const pathProblem = (path: string): string | null => {
  if (path === "" || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return "must be relative";
  if (path.includes("\\")) return "must use / as the separator";
  if (path.split("/").some((part) => part === "" || part === "." || part === ".."))
    return "must not leave the folder or contain empty or dot segments";
  return null;
};

/** The paths a change touches: its own, and a folder's files. */
export const changePaths = (change: Change): string[] =>
  change.kind === "dir"
    ? [change.path, ...change.files.map((file) => `${change.path}/${file.path}`)]
    : [change.path];
