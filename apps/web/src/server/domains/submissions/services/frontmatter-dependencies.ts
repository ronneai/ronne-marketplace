import {
  highestStable,
  type ItemType,
  normalizeFrontmatter,
  parseFrontmatter,
  parseItemName,
} from "@ronneai/core";
import { isMap, parseDocument } from "yaml";
import { MANIFEST_PATH } from "../models/submission";
import type { RegistryLookup } from "../repositories/registry-lookup";

/**
 * A skill names the agent that runs it in its `SKILL.md` frontmatter (097): `agent: @team/reviewer`
 * is how its author sets that dependency. When a draft is saved, the frontmatter's unquoted item
 * names are quoted, so the file stays valid YAML for every tool, and an `agent:` item name that
 * `ronne.yaml` doesn't list yet is added to its dependencies: the latest release as `^<version>`,
 * or `^1.0.0` for one that isn't released, as 056's picker does.
 */

type TextFile = { path: string; encoding: "utf8" | "base64"; content: string };

/** The range a new dependency starts on. */
const startingRange = async (registry: RegistryLookup, name: string): Promise<string> => {
  const parsed = parseItemName(name);
  const item = parsed ? await registry.findItem(parsed.scope, parsed.name) : null;
  if (!item) return "^1.0.0";
  const versions = (await registry.publishedVersions(item.id))
    .filter((v) => !v.yanked)
    .map((v) => v.version);
  const stable = highestStable(versions);
  return stable ? `^${stable}` : "^1.0.0";
};

/**
 * The files a save should write instead, by path: the skill's entry file with its item names
 * quoted, and `ronne.yaml` with the frontmatter's agent added. Empty when there's nothing to change.
 */
export const frontmatterChanges = async (
  registry: RegistryLookup,
  type: ItemType,
  files: ReadonlyMap<string, TextFile>,
): Promise<Map<string, string>> => {
  const changes = new Map<string, string>();
  if (type !== "skill") return changes;
  const manifestFile = files.get(MANIFEST_PATH);
  if (manifestFile?.encoding !== "utf8") return changes;
  const doc = parseDocument(manifestFile.content);
  if (doc.errors.length > 0 || !isMap(doc.contents)) return changes;

  const entry = String(doc.getIn(["skill", "entry"]) ?? "SKILL.md");
  const skill = files.get(entry);
  if (skill?.encoding !== "utf8") return changes;
  const quoted = normalizeFrontmatter(skill.content);
  if (quoted !== skill.content) changes.set(entry, quoted);

  const agent = parseFrontmatter(quoted).data?.agent;
  if (typeof agent !== "string" || !parseItemName(agent)) return changes;
  const listed = doc.get("dependencies");
  if (isMap(listed) && listed.has(agent)) return changes;
  // Something other than a map: the manifest's checks say so, and it isn't replaced.
  if (listed !== undefined && listed !== null && !isMap(listed)) return changes;
  const range = await startingRange(registry, agent);
  if (isMap(listed)) listed.set(agent, range);
  else doc.set("dependencies", { [agent]: range });
  changes.set(MANIFEST_PATH, doc.toString());
  return changes;
};
