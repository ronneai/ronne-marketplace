import { parseDocument, stringify } from "yaml";
import { parseFrontmatter } from "../frontmatter.js";
import type { Manifest } from "../manifest.js";
import type { PackageFile } from "../package-file.js";
import { DESCRIPTION_MAX_LENGTH, oneLine } from "./text.js";

const MANIFEST = "ronne.yaml";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * A description given for an item (053), as the manifest takes it: on one line, trimmed. Null when
 * nothing is left, and `tooLong` when it's over the manifest's 300 characters: given text is never
 * cut, whoever wrote it shortens it.
 */
export const givenDescription = (value: string): { text: string | null; tooLong: boolean } => {
  const text = oneLine(value);
  return { text: text || null, tooLong: text.length > DESCRIPTION_MAX_LENGTH };
};

/** A Markdown file's frontmatter with `description` set, keeping everything else. */
const describedMarkdown = (source: string, description: string): string => {
  const { yaml, body } = parseFrontmatter(source);
  if (yaml === null) return `---\n${stringify({ description }, { lineWidth: 0 })}---\n${source}`;
  const doc = parseDocument(yaml);
  doc.set("description", description);
  return `---\n${doc.toString({ lineWidth: 0 })}---\n${body}`;
};

/**
 * An item a reader made, with `description` written into its `ronne.yaml` (053), keeping the rest
 * of the file as it is. For a skill, whose folder is installed as it is, the uploaded copy of its
 * entry file (`SKILL.md`) also gets it in its frontmatter when it has none there, since the Agent
 * Skills format and the tools read it from there; `entryChanged` says so. The local files are
 * never touched: this only changes what's uploaded.
 */
export const withDescription = (
  item: { files: readonly PackageFile[]; manifestText: string },
  description: string,
): {
  files: PackageFile[];
  manifestText: string;
  manifest: Manifest;
  entryChanged: string | null;
} => {
  const doc = parseDocument(item.manifestText);
  doc.set("description", description);
  const manifestText = doc.toString({ lineWidth: 0 });
  const manifest = doc.toJS({ maxAliasCount: 0 }) as Manifest;
  let entryChanged: string | null = null;
  const files = item.files.map((file): PackageFile => {
    if (file.path === MANIFEST) return { ...file, bytes: encoder.encode(manifestText) };
    if (manifest.type !== "skill") return file;
    const entry = (manifest.skill as { entry?: unknown } | undefined)?.entry;
    if (file.path !== (typeof entry === "string" && entry ? entry : "SKILL.md")) return file;
    const source = decoder.decode(file.bytes);
    const own = parseFrontmatter(source).data?.description;
    if (typeof own === "string" && own.trim()) return file;
    entryChanged = file.path;
    return { ...file, bytes: encoder.encode(describedMarkdown(source, description)) };
  });
  return { files, manifestText, manifest, entryChanged };
};
