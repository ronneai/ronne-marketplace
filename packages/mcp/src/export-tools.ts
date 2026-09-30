import { describeLocalItems, type Io, type Ownership } from "@ronneai/rmk/lib";
import { answer, type ToolAnswer } from "./text.js";

/**
 * Exporting from inside the AI tool (feature 039, MVP §7): 038's pipeline behind three tools. Only
 * items found in the tools' own folders can be exported, never a path, and nothing leaves the
 * machine until the person has seen the plan and approved `export_items`.
 */

export type Origin = "yours" | "installed" | "installed_edited" | "registry_copy" | "rendered";

const originOf = (ownership: Ownership): { origin: Origin; item?: string; version?: string } => {
  switch (ownership.owner) {
    case "local":
      return { origin: "yours" };
    case "installed":
      return {
        origin: ownership.edited ? "installed_edited" : "installed",
        item: ownership.item,
        version: ownership.version,
      };
    case "registry_copy":
      return {
        origin: "registry_copy",
        ...(ownership.item ? { item: ownership.item } : {}),
        version: ownership.version,
      };
    case "rendered":
      return { origin: "rendered", item: ownership.item, version: ownership.version };
  }
};

const ORIGIN_WORDS: Record<Origin, string> = {
  yours: "yours",
  installed: "installed",
  installed_edited: "installed and edited",
  registry_copy: "a registry copy",
  rendered: "written by rmk",
};

/** The items in the project (or the home folder), and whose each is. Reads no network. */
export const listLocalItems = async (
  io: Io,
  input: { scope?: "project" | "user"; type?: string },
): Promise<ToolAnswer> => {
  const scope = input.scope ?? "project";
  const found = (await describeLocalItems(io, scope)).filter(
    ({ item }) => !input.type || item.type === input.type,
  );
  const items = found.map(({ item, ownership }) => ({
    name: item.name,
    type: item.type,
    folder: item.display,
    ...originOf(ownership),
  }));
  if (items.length === 0)
    return answer(
      [
        `No skills found in .claude/skills/ or .agents/skills/${scope === "user" ? " in the home folder" : ""}. Items from the registry are installed with install tools, not exported.`,
      ],
      { scope, items },
    );
  const lines = [
    `Items found${scope === "user" ? " in the home folder" : ""}:`,
    ...items.map(
      (i) =>
        `  ${i.name}  ${i.type}  ${i.folder}  ${ORIGIN_WORDS[i.origin]}${i.item ? ` (${i.item}${i.version ? `@${i.version}` : ""})` : ""}`,
    ),
  ];
  if (items.some((i) => i.origin !== "yours"))
    lines.push(
      "Only items marked yours can be exported. To change an installed item, the person proposes a change on its page in the web app.",
    );
  return answer(lines, { scope, items });
};
