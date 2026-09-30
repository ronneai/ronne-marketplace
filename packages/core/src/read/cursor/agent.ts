import type { Manifest } from "../../manifest.js";
import type { PackageFile } from "../../package-file.js";
import {
  checkedName,
  descriptionOf,
  droppedFields,
  result,
  textOf,
} from "../claude-code/shared.js";
import { toItemName } from "../text.js";
import type { ReadResult, ReadWarning } from "../types.js";
import { cursorMarkdown } from "./shared.js";

const KEPT = ["name", "description", "model", "readonly"];

/** The short name a Cursor agent suggests: its `name`, else the file's, as Cursor does. */
export const cursorAgentName = (file: PackageFile, fileName: string): string => {
  const name = cursorMarkdown(textOf(file)).data?.name;
  return toItemName(
    typeof name === "string" && name.trim() ? name.trim() : fileName.replace(/\.md$/, ""),
  );
};

/**
 * A Cursor agent (`.cursor/agents/*.md`) as an item (native-readers.md §10): the body is
 * `prompt.md`; `readonly: true` is the tools that change nothing; the model, unless `inherit`, is
 * kept as `targets.cursor.overrides.model`, which the Cursor renderer reads.
 */
export const readCursorAgent = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, body } = cursorMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];
  const described = descriptionOf(data?.description, body, source, false);
  warnings.push(...described.warnings);
  warnings.push(...droppedFields(data, KEPT, source, "agent"));

  const manifest: Manifest = { name: options.itemName, type: "agent" };
  if (described.description) manifest.description = described.description;
  manifest.agent = {
    prompt: "prompt.md",
    ...(data?.readonly === true ? { tools: ["read", "grep", "glob"] } : {}),
  };
  const model = typeof data?.model === "string" ? data.model.trim() : "";
  if (model && model !== "inherit") manifest.targets = { cursor: { overrides: { model } } };
  return result(manifest, [{ path: "prompt.md", text: body }], warnings, []);
};
