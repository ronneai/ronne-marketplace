import { isMap, parseDocument, stringify } from "yaml";
import { parseFrontmatter } from "../frontmatter.js";
import type { Manifest } from "../manifest.js";
import { isValidName, parseItemName } from "../names.js";
import type { PackageFile } from "../package-file.js";
import { listOf, mcpServerOf } from "./claude-code/shared.js";
import { firstLine, fitDescription, toItemName } from "./text.js";
import { type ItemReference, ReadError, type ReadResult, type ReadWarning } from "./types.js";

const MANIFEST = "ronne.yaml";
const ENTRY = "SKILL.md";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const text = (file: PackageFile) => decoder.decode(file.bytes);

/**
 * The short name a skill folder suggests: `SKILL.md`'s frontmatter `name` when it's a valid item
 * name, else the folder's name made into one. Empty when neither gives anything usable.
 */
export const skillName = (files: readonly PackageFile[], folderName: string): string => {
  const entry = files.find((file) => file.path === ENTRY);
  const name = entry ? parseFrontmatter(text(entry)).data?.name : undefined;
  if (typeof name === "string" && isValidName(name, "item")) return name;
  return toItemName(folderName) || (typeof name === "string" ? toItemName(name) : "");
};

/** The hand-written `ronne.yaml`, as a document to change, or null when there's none. */
const baseManifest = (files: readonly PackageFile[]) => {
  const file = files.find((f) => f.path === MANIFEST);
  if (!file) return null;
  const doc = parseDocument(text(file));
  if (doc.errors.length > 0 || !isMap(doc.contents))
    throw new ReadError("manifest_invalid", `${MANIFEST} in the folder isn't a YAML mapping.`);
  const type = doc.get("type");
  if (type !== undefined && type !== "skill")
    throw new ReadError(
      "manifest_invalid",
      `${MANIFEST} in the folder is for ${String(type)}, not a skill.`,
    );
  return { doc, text: text(file) };
};

/** The entry file's path: the base manifest's `skill.entry`, or `SKILL.md`. */
const entryPath = (base: ReturnType<typeof baseManifest>): string => {
  const entry = base?.doc.getIn(["skill", "entry"]);
  return typeof entry === "string" && entry ? entry : ENTRY;
};

/** The entry file with its frontmatter `name` set to `name`, keeping everything else. */
const withName = (source: string, name: string): string => {
  const { yaml, body } = parseFrontmatter(source);
  if (yaml === null) return `---\nname: ${name}\n---\n${source}`;
  const doc = parseDocument(yaml);
  doc.set("name", name);
  return `---\n${doc.toString({ lineWidth: 0 })}---\n${body}`;
};

/** Claude Code's own agents, which no item stands for (097). */
const BUILT_IN_AGENTS = ["explore", "plan", "general-purpose"];

/**
 * The agent a Claude Code skill names (097): a local agent's name is a reference. An item name is
 * already a dependency, a built-in or a plugin's agent (`plugin:agent`) is no item, so neither is.
 */
const agentReferenceOf = (agent: unknown): ItemReference[] =>
  typeof agent === "string" &&
  agent.trim() !== "" &&
  !agent.startsWith("@") &&
  !agent.includes(":") &&
  !BUILT_IN_AGENTS.includes(agent.trim().toLowerCase())
    ? [{ kind: "agent", name: agent.trim(), from: "agent" }]
    : [];

/**
 * A skill folder as an item (native-readers.md §4). The folder is the item, so the files are kept
 * as they are, with `ronne.yaml` added: a hand-written one is the base and only `name` is set (and
 * `version` removed); otherwise it's made from `SKILL.md`'s frontmatter. The uploaded copy of
 * `SKILL.md` gets its `name` set to the item's short name when it differs.
 */
export const readSkill = (
  files: readonly PackageFile[],
  options: { itemName: string },
): ReadResult => {
  const parsed = parseItemName(options.itemName);
  if (!parsed)
    throw new ReadError("invalid_name", `${options.itemName} isn't an item name (@scope/name).`);
  const base = baseManifest(files);
  const entry = entryPath(base);
  const entryFile = files.find((file) => file.path === entry);
  if (!entryFile) throw new ReadError("entry_missing", `The folder has no ${entry}.`);
  const source = text(entryFile);
  const front = parseFrontmatter(source);
  const warnings: ReadWarning[] = [];

  let manifestText: string;
  if (base) {
    let changed = false;
    if (base.doc.get("name") !== options.itemName) {
      base.doc.set("name", options.itemName);
      changed = true;
    }
    if (base.doc.get("type") === undefined) {
      base.doc.set("type", "skill");
      changed = true;
    }
    if (base.doc.has("version")) {
      base.doc.delete("version");
      changed = true;
      warnings.push({
        code: "version_removed",
        message: "ronne.yaml's version was left out: the version is set when the item is released.",
        file: MANIFEST,
      });
    }
    manifestText = changed ? base.doc.toString({ lineWidth: 0 }) : base.text;
  } else {
    const manifest: Manifest = { name: options.itemName, type: "skill" };
    const fromFront = front.data?.description;
    let description = typeof fromFront === "string" ? fromFront : "";
    if (!description.trim()) {
      description = firstLine(front.body);
      if (description)
        warnings.push({
          code: "description_from_body",
          message: `${entry} has no description in its frontmatter, so its first line is used.`,
          file: entry,
        });
    }
    if (description.trim()) {
      const fitted = fitDescription(description);
      manifest.description = fitted.text;
      if (fitted.cut)
        warnings.push({
          code: "description_cut",
          message: `The description is longer than 300 characters, so ronne.yaml has it cut short; ${entry} keeps the full text.`,
          file: MANIFEST,
        });
    }
    const license = front.data?.license;
    if (typeof license === "string" && license.trim()) manifest.license = license.trim();
    manifest.skill = { entry };
    manifestText = stringify(manifest, { lineWidth: 0 });
  }

  const out = new Map<string, PackageFile>();
  for (const file of files) if (file.path !== MANIFEST) out.set(file.path, file);
  out.set(MANIFEST, { path: MANIFEST, bytes: encoder.encode(manifestText) });
  if (front.data?.name !== parsed.name) {
    out.set(entry, { ...entryFile, bytes: encoder.encode(withName(source, parsed.name)) });
    warnings.push({
      code: "entry_name_set",
      message: `The uploaded ${entry} has name: ${parsed.name}, the item's name; the file in your folder is unchanged.`,
      file: entry,
    });
  }

  let manifest: Manifest;
  try {
    // No aliases: a crafted ronne.yaml can't expand into something huge.
    manifest = parseDocument(manifestText).toJS({ maxAliasCount: 0 }) as Manifest;
  } catch {
    throw new ReadError("manifest_invalid", `${MANIFEST} in the folder uses YAML aliases.`);
  }
  return {
    manifest,
    manifestText,
    descriptionSource: !manifest.description
      ? "none"
      : warnings.some((w) => w.code === "description_from_body")
        ? "body"
        : "item",
    files: [...out.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    warnings,
    // The MCP servers behind its allowed tools (native-readers.md §4), and the agent that runs it in
    // Claude Code (097), for 041.
    references: [
      ...listOf(front.data?.["allowed-tools"], /[\s,]+/)
        .map(mcpServerOf)
        .filter((server): server is string => server !== null)
        .filter((server, i, all) => all.indexOf(server) === i)
        .map((name) => ({ kind: "mcp-server" as const, name, from: "allowed-tools" })),
      ...agentReferenceOf(front.data?.agent),
    ],
  };
};
