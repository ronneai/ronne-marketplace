import { parse as parseYaml } from "yaml";

/**
 * A Markdown file split at its YAML frontmatter. `yaml` is the text between the `---` lines, or
 * null when there's no block; `data` is that text parsed, or null when it isn't a YAML mapping.
 * `body` is what follows the block, or the whole text when there's none.
 */
export type Frontmatter = {
  data: Record<string, unknown> | null;
  yaml: string | null;
  body: string;
};

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export const parseFrontmatter = (text: string): Frontmatter => {
  const match = BLOCK.exec(text);
  if (!match) return { data: null, yaml: null, body: text };
  const yaml = match[1] ?? "";
  const body = text.slice(match[0].length);
  try {
    const value = parseYaml(yaml, { maxAliasCount: 0 });
    return {
      data:
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null,
      yaml,
      body,
    };
  } catch {
    return { data: null, yaml, body };
  }
};
