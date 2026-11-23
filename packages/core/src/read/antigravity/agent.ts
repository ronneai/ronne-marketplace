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
import type { ReadResult, ReadWarning } from "../types.js";

const KEPT = ["name", "description", "tools", "model"];

/**
 * Antigravity's tool names as canonical ones (the renderer's table reversed, spec 029): the app's
 * documented names and the CLI's own (seen on the CLI 1.5.14), which are aliases of each other.
 */
const TOOLS: Record<string, string> = {
  view_file: "read",
  read_file: "read",
  replace_file_content: "edit",
  multi_replace_file_content: "edit",
  edit_file: "edit",
  write_to_file: "write",
  write_file: "write",
  grep_search: "grep",
  find_by_name: "glob",
  run_command: "shell",
  read_url_content: "web-fetch",
  search_web: "web-search",
};

/** Antigravity's models as the manifest's hints; `inherit` is no hint. */
const MODELS: Record<string, "fast" | "strong"> = { flash: "fast", pro: "strong" };

/** The name an Antigravity agent suggests: its `name`, else its file's (or folder's, for `agent.md`). */
export const antigravityAgentName = (file: PackageFile, fileName: string): string => {
  const name = splitMarkdown(textOf(file)).data?.name;
  if (typeof name === "string" && name.trim()) return toItemName(name.trim());
  const parts = file.path.split("/");
  const stem = fileName === "agent.md" ? (parts.at(-2) ?? fileName) : fileName;
  return toItemName(stem.replace(/\.md$/, ""));
};

/**
 * An Antigravity agent (`.agents/agents/*.md` or `.agents/agents/<n>/agent.md`,
 * `~/.gemini/config/agents/`) as an item (native-readers.md §13): the body is `prompt.md`; `tools`
 * go back to canonical tools; `flash` and `pro` are the `fast` and `strong` hints, `inherit` none,
 * and any other model is kept as `targets.antigravity.overrides.model`.
 */
export const readAntigravityAgent = (
  file: PackageFile,
  options: { itemName: string },
): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, body } = splitMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];
  const described = descriptionOf(data?.description, body, source, false);
  warnings.push(...described.warnings);
  warnings.push(...droppedFields(data, KEPT, source, "agent"));

  const tools: string[] = [];
  for (const native of listOf(data?.tools)) {
    const canonical = Object.hasOwn(TOOLS, native) ? TOOLS[native] : undefined;
    if (!canonical) {
      warnings.push({
        code: "tool_dropped",
        message: `The tool \`${native}\` was left out of the agent's tools: Ronne has no name for it, so no AI tool would get it.`,
        file: source,
      });
      continue;
    }
    if (!tools.includes(canonical)) tools.push(canonical);
  }

  const manifest: Manifest = { name: options.itemName, type: "agent" };
  if (described.description) manifest.description = described.description;
  const block: Record<string, unknown> = {
    prompt: "prompt.md",
    ...(tools.length ? { tools } : {}),
  };
  const model = typeof data?.model === "string" ? data.model.trim() : "";
  const hint = Object.hasOwn(MODELS, model) ? MODELS[model] : undefined;
  if (hint) block.model = hint;
  else if (model && model !== "inherit")
    manifest.targets = { antigravity: { overrides: { model } } };
  manifest.agent = block;
  return result(manifest, [{ path: "prompt.md", text: body }], warnings, []);
};
