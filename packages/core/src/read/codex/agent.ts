import type { Manifest } from "../../manifest.js";
import { isValidName } from "../../names.js";
import { checkedName, descriptionOf, result } from "../claude-code/shared.js";
import { toItemName } from "../text.js";
import { ReadError, type ReadResult, type ReadWarning } from "../types.js";

/** The keys a Codex agent keeps; the model becomes an override for Codex. */
const KEPT = ["name", "description", "developer_instructions", "model"];

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** The short name a Codex agent suggests: its `name` (Codex's source of truth), else the file's. */
export const codexAgentName = (value: unknown, fileName: string): string => {
  const name = record(value)?.name;
  return toItemName(
    typeof name === "string" && name.trim() ? name.trim() : fileName.replace(/\.toml$/, ""),
  );
};

/**
 * A Codex agent (`.codex/agents/*.toml`, parsed) as an item (native-readers.md §9): the
 * instructions are `prompt.md`; Codex's model is kept as `targets.codex.overrides.model`, which the
 * Codex renderer reads; Codex agents have no tool list. Other keys are dropped with a warning each.
 */
export const readCodexAgent = (
  value: unknown,
  options: { itemName: string; fileName: string },
): ReadResult => {
  checkedName(options.itemName);
  const source = options.fileName;
  const config = record(value);
  if (!config) throw new ReadError("manifest_invalid", `${source} isn't a TOML table.`);
  const warnings: ReadWarning[] = [];

  if (typeof config.name !== "string" || !config.name.trim())
    warnings.push({
      code: "name_changed",
      message: `${source} has no name, which Codex requires, so the file's name is used.`,
      file: source,
    });
  else if (!isValidName(config.name, "item"))
    warnings.push({
      code: "name_changed",
      message: `The agent's name ${config.name} can't be an item name, so it's made into one.`,
      file: source,
    });

  const instructions =
    typeof config.developer_instructions === "string" ? config.developer_instructions : "";
  const described = descriptionOf(config.description, "", source, false);
  warnings.push(...described.warnings);

  for (const key of Object.keys(config).filter((k) => !KEPT.includes(k)))
    warnings.push({
      code: "field_dropped",
      message:
        key === "mcp_servers"
          ? `The MCP servers defined inside ${source}'s \`mcp_servers\` were left out: export each server on its own.`
          : `${source}'s \`${key}\` was left out: an agent in Ronne has no such setting.`,
      file: source,
    });

  const manifest: Manifest = { name: options.itemName, type: "agent" };
  if (described.description) manifest.description = described.description;
  manifest.agent = { prompt: "prompt.md" };
  if (typeof config.model === "string" && config.model.trim())
    manifest.targets = { codex: { overrides: { model: config.model.trim() } } };
  let end = instructions.length;
  while (end > 0 && (instructions[end - 1] === "\n" || instructions[end - 1] === "\r")) end -= 1;
  const prompt = instructions.slice(0, end);
  return result(manifest, [{ path: "prompt.md", text: prompt ? `${prompt}\n` : "" }], warnings, []);
};
