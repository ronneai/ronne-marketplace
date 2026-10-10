import { parse as parseYaml, YAMLParseError } from "yaml";

/**
 * A Markdown file split at its YAML frontmatter. `yaml` is the text between the `---` lines, or
 * null when there's no block; `data` is that text parsed, or null when it isn't a YAML mapping.
 * `body` is what follows the block, or the whole text when there's none. `error` says why a block
 * didn't parse, with its line in the whole file (097).
 */
export type Frontmatter = {
  data: Record<string, unknown> | null;
  yaml: string | null;
  body: string;
  error: { message: string; line: number | null } | null;
};

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * An item name standing alone as a value, after `key:` or a list's `- `, unquoted (097). YAML can't
 * start a plain value with `@`, but `agent: @test/agent` is how people write it, so it's read as
 * quoted. The name parts are the item name rules (names.ts).
 */
const UNQUOTED_ITEM_NAME =
  /^(\s*(?:[^\s:#'"][^:#]*:|-)[ \t]+)(@[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?){1,2})([ \t]*(?:#.*)?)$/;

/**
 * A key or list item whose value is a block scalar: `|` or `>`, then the chomping and indentation
 * indicators in either order. A key may be quoted ('a #': or "a": ) or plain (no `:` or `#`).
 */
const BLOCK_SCALAR =
  /^(\s*)(?:(?:'[^'\n]*'|"[^"\n]*"|[^\s#'"][^:#]*):|-)[ \t]+[|>](?:[+-]\d?|\d[+-]?)?[ \t]*(?:#.*)?$/;

const indentOf = (line: string) => line.length - line.trimStart().length;

/**
 * Frontmatter YAML with each unquoted item name quoted; anything else as it is, including the lines
 * of a `|` or `>` block, which are text.
 */
export const quoteItemNames = (yaml: string): string => {
  let blockIndent: number | null = null;
  return yaml
    .split("\n")
    .map((line) => {
      const crlf = line.endsWith("\r");
      const bare = crlf ? line.slice(0, -1) : line;
      if (blockIndent !== null) {
        if (bare.trim() === "" || indentOf(bare) > blockIndent) return line;
        blockIndent = null;
      }
      const scalar = BLOCK_SCALAR.exec(bare);
      if (scalar) {
        blockIndent = scalar[1]?.length ?? 0;
        return line;
      }
      const match = UNQUOTED_ITEM_NAME.exec(bare);
      return match ? `${match[1]}"${match[2]}"${match[3]}${crlf ? "\r" : ""}` : line;
    })
    .join("\n");
};

/**
 * The file with its frontmatter's unquoted item names quoted, as a draft is saved (097); the same
 * text when there's nothing to quote.
 */
export const normalizeFrontmatter = (text: string): string => {
  const match = BLOCK.exec(text);
  if (!match) return text;
  const yaml = match[1] ?? "";
  const quoted = quoteItemNames(yaml);
  if (quoted === yaml) return text;
  // The block's text starts after the opening `---` and its line break.
  const start = match[0].startsWith("---\r\n") ? 5 : 4;
  return `${text.slice(0, start)}${quoted}${text.slice(start + yaml.length)}`;
};

export const parseFrontmatter = (text: string): Frontmatter => {
  const match = BLOCK.exec(text);
  if (!match) return { data: null, yaml: null, body: text, error: null };
  const yaml = match[1] ?? "";
  const body = text.slice(match[0].length);
  try {
    const value = parseYaml(quoteItemNames(yaml), { maxAliasCount: 0 });
    const data =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    return {
      data,
      yaml,
      body,
      // Empty, or not keys and values: there's no frontmatter to speak of, but nothing to report
      // as a YAML error either.
      error: null,
    };
  } catch (thrown) {
    // The block starts on the file's second line, after the opening `---`.
    const at = thrown instanceof YAMLParseError ? thrown.linePos?.[0]?.line : undefined;
    const message =
      thrown instanceof Error
        ? (thrown.message.split("\n")[0] ?? "").replace(/ at line .*$/, "")
        : "";
    return { data: null, yaml, body, error: { message, line: at === undefined ? null : at + 1 } };
  }
};
