import { isMap, isScalar, parseDocument } from "yaml";

/**
 * `ronne.yaml` under the names items have now (118), as released and as a proposal starts: `name` is the item's full name now, and each dependency is under
 * the name it has now, keeping comments, quoting and order. Unchanged if it can't be read.
 */
export const manifestNamed = (
  text: string,
  name: string,
  dependencies: ReadonlyMap<string, string>,
): string => {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return text;
  const own = doc.get("name", true);
  if (isScalar(own) && own.value !== name) own.value = name;
  const needs = doc.get("dependencies", true);
  if (isMap(needs))
    for (const pair of needs.items)
      if (isScalar(pair.key) && typeof pair.key.value === "string") {
        const now = dependencies.get(pair.key.value);
        if (now && now !== pair.key.value) pair.key.value = now;
      }
  return doc.toString();
};

/** A scalar's new source text, in the quotes it had (`@` can't start a plain YAML value). */
const quotedLike = (type: string | undefined, value: string) =>
  type === "QUOTE_SINGLE"
    ? `'${value.replaceAll("'", "''")}'`
    : type === "PLAIN" && !value.startsWith("@")
      ? value
      : JSON.stringify(value);

/**
 * ronne.yaml with item names changed where `rename` gives a new one (113: a workspace's rename):
 * `name` and the dependencies' keys. Each value is replaced where it stands, in the quotes it had,
 * so comments, line endings and layout stay the author's. Unchanged if it can't be read.
 */
export const renamedManifest = (text: string, rename: (name: string) => string | null): string => {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return text;
  const edits: { start: number; end: number; text: string }[] = [];
  const replace = (node: unknown) => {
    if (!isScalar(node) || typeof node.value !== "string" || !node.range) return;
    const to = rename(node.value);
    if (to === null || to === node.value) return;
    // A block scalar's range takes in its line break: the next key stays on its own line.
    let end = node.range[1];
    while (end > node.range[0] && (text[end - 1] === "\n" || text[end - 1] === "\r")) end--;
    edits.push({ start: node.range[0], end, text: quotedLike(node.type, to) });
  };
  replace(doc.get("name", true));
  const needs = doc.get("dependencies", true);
  if (isMap(needs)) for (const pair of needs.items) replace(pair.key);
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((out, e) => `${out.slice(0, e.start)}${e.text}${out.slice(e.end)}`, text);
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const AGENT_LINE = /^(agent:[ \t]*)(["']?)(@[a-z0-9/-]+)\2([ \t]*(?:#.*)?\r?)$/;

/**
 * A skill's entry file with its frontmatter's `agent:` renamed where `rename` gives a new name
 * (113), on its own line, quoted as it was; anything else as it is.
 */
export const renamedFrontmatterAgent = (
  text: string,
  rename: (name: string) => string | null,
): string => {
  const match = FRONTMATTER.exec(text);
  if (!match) return text;
  const start = match[0].startsWith("---\r\n") ? 5 : 4;
  const yaml = match[1] ?? "";
  const lines = yaml.split("\n").map((line) => {
    const agent = AGENT_LINE.exec(line);
    const to = agent ? rename(agent[3] ?? "") : null;
    if (!agent || to === null) return line;
    const quote = agent[2] || '"';
    return `${agent[1]}${quote}${to}${quote}${agent[4]}`;
  });
  return `${text.slice(0, start)}${lines.join("\n")}${text.slice(start + yaml.length)}`;
};
