import type { Manifest } from "../../manifest.js";
import { isValidName } from "../../names.js";
import type { PackageFile } from "../../package-file.js";
import { toItemName } from "../text.js";
import type { ItemReference, ReadResult, ReadWarning } from "../types.js";
import {
  canonicalModel,
  canonicalTool,
  checkedName,
  descriptionOf,
  droppedFields,
  listOf,
  mcpServerOf,
  result,
  splitMarkdown,
  textOf,
} from "./shared.js";

/**
 * The frontmatter fields an agent keeps. `skills` and the servers `mcpServers` names become
 * references, which export declares as dependencies (041); inline server definitions can't be.
 */
const KEPT = ["name", "description", "tools", "model", "skills", "mcpServers"];

/**
 * The short name an agent file suggests: its frontmatter `name` (which identifies it in Claude
 * Code, whatever the file is called), made into an item name when it isn't one, else the file's.
 */
export const agentName = (file: PackageFile, fileName: string): string => {
  const name = splitMarkdown(textOf(file)).data?.name;
  if (typeof name === "string" && name.trim()) return toItemName(name.trim());
  return toItemName(fileName.replace(/\.md$/, ""));
};

/**
 * A Claude Code agent (`.claude/agents/**\/*.md`) as an item (native-readers.md §5): the body is
 * `prompt.md`; tools and the model go through the renderer's tables reversed; every other field
 * is dropped with a warning that names it.
 */
export const readAgent = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, body } = splitMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];
  const references: ItemReference[] = [];

  const nativeName = data?.name;
  if (typeof nativeName === "string" && !isValidName(nativeName, "item"))
    warnings.push({
      code: "name_changed",
      message: `The agent's name ${nativeName} can't be an item name, so it's ${toItemName(nativeName) || "given another"}; Claude Code will call it by the new name.`,
      file: source,
    });

  const described = descriptionOf(data?.description, body, source, false);
  warnings.push(...described.warnings);

  const tools: string[] = [];
  for (const native of listOf(data?.tools)) {
    const server = mcpServerOf(native);
    if (server && !references.some((r) => r.kind === "mcp-server" && r.name === server))
      references.push({ kind: "mcp-server", name: server, from: "tools" });
    const canonical = canonicalTool(native);
    if (canonical) {
      if (!tools.includes(canonical)) tools.push(canonical);
    } else
      warnings.push({
        code: "tool_dropped",
        message: `The tool \`${native}\` was left out of the agent's tools: Ronne has no name for it, so no AI tool would get it.`,
        file: source,
      });
  }

  let model: "fast" | "strong" | null = null;
  if (typeof data?.model === "string" && data.model.trim()) {
    model = canonicalModel(data.model.trim());
    if (!model)
      warnings.push({
        code: "model_default",
        message: `The model \`${data.model}\` was read as the default: Ronne names only a fast and a strong model, so the agent will use each AI tool's default.`,
        file: source,
      });
  }

  for (const skill of listOf(data?.skills))
    references.push({ kind: "skill", name: skill, from: "skills" });
  for (const server of Array.isArray(data?.mcpServers) ? data.mcpServers : [])
    if (typeof server !== "string")
      warnings.push({
        code: "field_dropped",
        message: `An MCP server defined inside ${source}'s \`mcpServers\` was left out: export the server on its own, and the agent can name it.`,
        file: source,
      });
    else if (!references.some((r) => r.name === server))
      references.push({ kind: "mcp-server", name: server, from: "mcpServers" });

  warnings.push(...droppedFields(data, KEPT, source, "agent"));

  const manifest: Manifest = { name: options.itemName, type: "agent" };
  if (described.description) manifest.description = described.description;
  const block: Record<string, unknown> = { prompt: "prompt.md" };
  if (tools.length > 0) block.tools = tools;
  if (model) block.model = model;
  manifest.agent = block;
  return result(manifest, [{ path: "prompt.md", text: body }], warnings, references);
};
