import type { Manifest } from "../../manifest.js";
import type { PackageFile } from "../../package-file.js";
import {
  checkedName,
  descriptionOf,
  droppedFields,
  listOf,
  result,
  splitMarkdown,
  textOf,
} from "../claude-code/shared.js";
import { toItemName } from "../text.js";
import type { ItemReference, ReadResult, ReadWarning } from "../types.js";

const KEPT = ["name", "description", "tools", "model"];

/**
 * Copilot's tool aliases as canonical tools (the renderer's table, reversed, spec 028). An alias
 * that stands for several becomes all of them, with a warning, since the item then allows more.
 */
const ALIASES: Record<string, string[]> = {
  read: ["read"],
  edit: ["edit", "write"],
  search: ["grep", "glob"],
  execute: ["shell"],
  web: ["web-fetch", "web-search"],
};

/** The file's name without `.agent.md` (or `.md`), as Copilot names an agent without `name`. */
const stem = (fileName: string) => fileName.replace(/\.agent\.md$|\.md$/, "");

/** The short name a Copilot agent suggests: its `name`, else the file's. */
export const copilotAgentName = (file: PackageFile, fileName: string): string => {
  const name = splitMarkdown(textOf(file)).data?.name;
  return toItemName(typeof name === "string" && name.trim() ? name.trim() : stem(fileName));
};

/**
 * A Copilot agent (`.github/agents/*.agent.md`, `~/.copilot/agents/`) as an item
 * (native-readers.md §11): the body is `prompt.md`; `tools` become canonical tools and an MCP
 * server's tools a reference to it; `model` is kept as `targets.copilot.overrides.model`.
 */
export const readCopilotAgent = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, body } = splitMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];
  const references: ItemReference[] = [];
  const described = descriptionOf(data?.description, body, source, false);
  warnings.push(...described.warnings);
  warnings.push(...droppedFields(data, KEPT, source, "agent"));

  const tools: string[] = [];
  const add = (tool: string) => {
    if (!tools.includes(tool)) tools.push(tool);
  };
  for (const native of listOf(data?.tools)) {
    const alias = native.trim().toLowerCase();
    // A tool alias, `<server>/<tool>` or `<server>/*`, not an item name.
    const [server = "", ...rest] = native.trim().split("/");
    const tool = rest.join("/");
    if (server && rest.length) {
      add(tool === "*" ? `mcp:${server}` : `mcp:${server}/${tool}`);
      if (!references.some((r) => r.kind === "mcp-server" && r.name === server))
        references.push({ kind: "mcp-server", name: server, from: "tools" });
      continue;
    }
    const canonical = Object.hasOwn(ALIASES, alias) ? ALIASES[alias] : undefined;
    if (!canonical) {
      warnings.push({
        code: "tool_dropped",
        message: `The tool \`${native}\` was left out of the agent's tools: Ronne has no name for it, so no AI tool would get it.`,
        file: source,
      });
      continue;
    }
    for (const tool of canonical) add(tool);
    if (canonical.length > 1)
      warnings.push({
        code: "field_dropped",
        message: `Copilot's \`${alias}\` stands for ${canonical.map((t) => `\`${t}\``).join(" and ")}, so the agent gets all of them.`,
        file: source,
      });
  }

  const manifest: Manifest = { name: options.itemName, type: "agent" };
  if (described.description) manifest.description = described.description;
  manifest.agent = { prompt: "prompt.md", ...(tools.length ? { tools } : {}) };
  const model = typeof data?.model === "string" ? data.model.trim() : "";
  if (model) manifest.targets = { copilot: { overrides: { model } } };
  return result(manifest, [{ path: "prompt.md", text: body }], warnings, references);
};
