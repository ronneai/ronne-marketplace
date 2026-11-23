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
import { type ItemReference, ReadError, type ReadResult, type ReadWarning } from "../types.js";

const KEPT = ["name", "description", "tools", "model", "kind"];

/** Gemini CLI's tool names as canonical ones (the renderer's table reversed, spec 029). */
const TOOLS: Record<string, string> = {
  read_file: "read",
  read_many_files: "read",
  replace: "edit",
  write_file: "write",
  grep_search: "grep",
  search_file_content: "grep",
  glob: "glob",
  run_shell_command: "shell",
  web_fetch: "web-fetch",
  google_web_search: "web-search",
};

/** The name a Gemini CLI agent suggests: its `name`, else its file's. */
export const geminiAgentName = (file: PackageFile, fileName: string): string => {
  const name = splitMarkdown(textOf(file)).data?.name;
  return toItemName(
    typeof name === "string" && name.trim() ? name.trim() : fileName.replace(/\.md$/, ""),
  );
};

/**
 * A Gemini CLI agent (`.gemini/agents/*.md`, `~/.gemini/agents/`) as an item (native-readers.md
 * §14): the body is `prompt.md`; `tools` go back to canonical tools, `mcp_<s>_<t>` to `mcp:<s>/<t>`
 * (and `mcp_<s>_*` to `mcp:<s>`) with a reference to the server; `model` is kept as
 * `targets.gemini.overrides.model`. A remote agent (`kind: remote`) has no prompt to read.
 */
export const readGeminiAgent = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, body } = splitMarkdown(textOf(file));
  if (data?.kind === "remote")
    throw new ReadError(
      "manifest_invalid",
      `${source} is a remote agent, which runs elsewhere: Ronne's agents are prompts, so it can't be exported.`,
    );
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
    // `mcp_<server>_<tool>`, split at the first `_` after `mcp_`, as Gemini CLI does.
    const mcp = native.startsWith("mcp_") ? native.slice(4) : null;
    const cut = mcp ? mcp.indexOf("_") : -1;
    if (mcp && cut > 0 && cut < mcp.length - 1) {
      const server = mcp.slice(0, cut);
      const tool = mcp.slice(cut + 1);
      add(tool === "*" ? `mcp:${server}` : `mcp:${server}/${tool}`);
      if (!references.some((r) => r.kind === "mcp-server" && r.name === server))
        references.push({ kind: "mcp-server", name: server, from: "tools" });
      continue;
    }
    const canonical = Object.hasOwn(TOOLS, native) ? TOOLS[native] : undefined;
    if (!canonical) {
      warnings.push({
        code: "tool_dropped",
        message: `The tool \`${native}\` was left out of the agent's tools: Ronne has no name for it, so no AI tool would get it.`,
        file: source,
      });
      continue;
    }
    add(canonical);
  }

  const manifest: Manifest = { name: options.itemName, type: "agent" };
  if (described.description) manifest.description = described.description;
  manifest.agent = { prompt: "prompt.md", ...(tools.length ? { tools } : {}) };
  const model = typeof data?.model === "string" ? data.model.trim() : "";
  if (model && model !== "inherit") manifest.targets = { gemini: { overrides: { model } } };
  return result(manifest, [{ path: "prompt.md", text: body }], warnings, references);
};
