import { parse as parseYaml } from "yaml";
import { parseFrontmatter } from "../../frontmatter.js";

/**
 * A Cursor Markdown file's frontmatter, body and raw `globs`. Cursor writes globs unquoted
 * (`globs: **\/*.ts, src/**`), which YAML reads as an alias and refuses, so the `globs` line (or a
 * list under it) is taken out as text first and the rest is parsed as YAML.
 */
export const cursorMarkdown = (text: string) => {
  const { yaml, body } = parseFrontmatter(text);
  let globs: string[] | null = null;
  const kept: string[] = [];
  const lines = (yaml ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.startsWith("globs:")) {
      kept.push(line);
      continue;
    }
    const rest = line.slice("globs:".length).trim();
    const items: string[] = [];
    if (rest) items.push(...rest.replace(/^\[|\]$/g, "").split(","));
    while (!rest && (lines[i + 1] ?? "").trimStart().startsWith("- ")) {
      i += 1;
      items.push((lines[i] ?? "").trimStart().slice(2));
    }
    globs = items.map((g) => g.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  let data: Record<string, unknown> | null = null;
  if (yaml !== null)
    try {
      const parsed: unknown = parseYaml(kept.join("\n"), { maxAliasCount: 0 });
      data =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
    } catch {
      data = null;
    }
  let start = 0;
  while (body[start] === "\n" || body[start] === "\r") start += 1;
  let end = body.length;
  while (end > start && (body[end - 1] === "\n" || body[end - 1] === "\r")) end -= 1;
  const trimmed = body.slice(start, end);
  return {
    data,
    globs,
    hasFrontmatter: yaml !== null,
    body: trimmed ? `${trimmed}\n` : "",
  };
};
