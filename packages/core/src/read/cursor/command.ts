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

/** The extensions Cursor reads commands from. */
export const CURSOR_COMMAND_EXTENSIONS = [".md", ".mdc", ".markdown", ".txt"] as const;

const withoutExtension = (path: string) => {
  const ext = CURSOR_COMMAND_EXTENSIONS.find((e) => path.endsWith(e));
  return ext ? path.slice(0, -ext.length) : path;
};

/**
 * The short name a Cursor command suggests: its frontmatter `name`, else its path under
 * `commands/` (a subfolder joins it with a hyphen).
 */
export const cursorCommandName = (file: PackageFile, pathUnderCommands: string): string => {
  const name = cursorMarkdown(textOf(file)).data?.name;
  if (typeof name === "string" && name.trim()) return toItemName(name.trim());
  return toItemName(withoutExtension(pathUnderCommands).split("/").join("-"));
};

/**
 * A Cursor command (`.cursor/commands/`) as an item (native-readers.md §10): the body is
 * `command.md`, and the description is the frontmatter's or the first line. Cursor commands take no
 * declared arguments.
 */
export const readCursorCommand = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, body } = cursorMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];
  const described = descriptionOf(data?.description, body, source, true);
  warnings.push(...described.warnings);
  warnings.push(...droppedFields(data, ["name", "description"], source, "command"));
  const manifest: Manifest = { name: options.itemName, type: "command" };
  if (described.description) manifest.description = described.description;
  manifest.command = { body: "command.md" };
  return result(manifest, [{ path: "command.md", text: body }], warnings, []);
};
