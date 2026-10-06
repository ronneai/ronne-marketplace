import { parseFrontmatter } from "../frontmatter.js";
import { isItemType } from "../item-types.js";
import { parseItemName } from "../names.js";
import { shortName } from "./helpers.js";
import type { RenderDependency, RenderInput } from "./types.js";

/**
 * A skill's `SKILL.md` frontmatter as each tool takes it (097). In Ronne, `agent: "@scope/name"`
 * names the agent that runs the skill, and it's a dependency. Claude Code takes `agent: <name>`, the
 * installed agent's name, and uses it only with `context: fork`. Codex and Cursor read neither key,
 * and the Agent Skills standard refuses unknown keys, so their shared copy goes without both.
 * Everything else in the file is kept as written; a file that needs nothing comes back the same.
 */

const BLOCK = /^---(\r?\n)([\s\S]*?)\r?\n---(?:\r?\n|$)/;
/** A key at the start of a line: the frontmatter's own keys, not nested ones. */
const TOP_KEY = /^([A-Za-z0-9_-]+)[ \t]*:/;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

type Lines = { eol: string; lines: string[]; start: number; end: number; text: string };

/** The frontmatter block's lines, where they are in the text, and its line ending. */
const linesOf = (text: string): Lines | null => {
  const match = BLOCK.exec(text);
  if (!match) return null;
  const eol = match[1] ?? "\n";
  const yaml = match[2] ?? "";
  const start = 3 + eol.length;
  return { eol, lines: yaml.split(eol), start, end: start + yaml.length, text };
};

const rebuild = ({ eol, lines, start, end, text }: Lines) =>
  `${text.slice(0, start)}${lines.join(eol)}${text.slice(end)}`;

/** A key's line and the indented lines that belong to it (a list, a block). */
const keySpan = (lines: readonly string[], key: string): [number, number] | null => {
  const at = lines.findIndex((line) => TOP_KEY.exec(line)?.[1] === key);
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && /^[ \t]/.test(lines[end] ?? "")) end++;
  return [at, end];
};

/**
 * Claude Code's `SKILL.md`: an item name as the installed agent, with `context: fork`; inside a
 * plugin, `plugin:agent`.
 */
export const claudeCodeSkillEntry = (bytes: Uint8Array, plugin?: string): Uint8Array => {
  const text = decoder.decode(bytes);
  const agent = parseFrontmatter(text).data?.agent;
  if (typeof agent !== "string" || !parseItemName(agent)) return bytes;
  const block = linesOf(text);
  const span = block && keySpan(block.lines, "agent");
  if (!block || !span) return bytes;
  const replaced = [`agent: ${plugin ? `${plugin}:` : ""}${shortName(agent)}`];
  if (!keySpan(block.lines, "context")) replaced.push("context: fork");
  block.lines.splice(span[0], span[1] - span[0], ...replaced);
  return encoder.encode(rebuild(block));
};

/**
 * A `SKILL.md` whose agent is `name`, quoted (097): what export uploads once a local agent's name
 * is declared as an item. The same bytes when there's no top-level `agent` to change.
 */
export const withAgentName = (bytes: Uint8Array, name: string): Uint8Array => {
  const text = decoder.decode(bytes);
  const block = linesOf(text);
  const span = block && keySpan(block.lines, "agent");
  if (!block || !span) return bytes;
  block.lines.splice(span[0], span[1] - span[0], `agent: ${JSON.stringify(name)}`);
  return encoder.encode(rebuild(block));
};

/** Codex's and Cursor's `SKILL.md`: without `agent` and `context`, and whether they were there. */
export const agentsSkillEntry = (bytes: Uint8Array): { bytes: Uint8Array; dropped: boolean } => {
  const text = decoder.decode(bytes);
  const block = linesOf(text);
  if (!block || !parseFrontmatter(text).data) return { bytes, dropped: false };
  let dropped = false;
  for (const key of ["agent", "context"]) {
    const span = keySpan(block.lines, key);
    if (!span) continue;
    block.lines.splice(span[0], span[1] - span[0]);
    dropped = true;
  }
  return dropped ? { bytes: encoder.encode(rebuild(block)), dropped } : { bytes, dropped };
};

/**
 * What a renderer is told about an item when another depends on it (097): its type and, for a
 * skill, whether Claude Code may preload it (not when it sets `disable-model-invocation`).
 */
export const renderDependencyOf = (input: {
  name: string;
  manifest: Record<string, unknown>;
  files: readonly { path: string; bytes: Uint8Array }[];
}): RenderDependency | null => {
  const type = String(input.manifest.type ?? "");
  if (!isItemType(type)) return null;
  if (type !== "skill") return { name: input.name, type };
  const block = (input.manifest.skill ?? {}) as Record<string, unknown>;
  const entry = String(block.entry ?? "SKILL.md");
  const file = input.files.find((f) => f.path === entry);
  const front = file ? parseFrontmatter(decoder.decode(file.bytes)).data : null;
  return { name: input.name, type, preload: front?.["disable-model-invocation"] !== true };
};

/** An item's input with what's known of its own dependencies, by name (`rmk`, plugins, tests). */
export const withDependencies = <T extends RenderInput>(
  input: T,
  known: ReadonlyMap<string, RenderDependency>,
): T => ({
  ...input,
  dependencies: Object.keys((input.manifest.dependencies ?? {}) as Record<string, unknown>)
    .map((name) => known.get(name))
    .filter((d): d is RenderDependency => d !== undefined),
});
