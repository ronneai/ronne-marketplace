import type { Manifest } from "../../manifest.js";
import type { PackageFile } from "../../package-file.js";
import { toItemName } from "../text.js";
import type { ReadResult, ReadWarning } from "../types.js";
import {
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
 * The frontmatter a command keeps. `disable-model-invocation: true` is what the renderer writes,
 * so it loses nothing; without it, the command could also be invoked by the model, and that's
 * said once, below.
 */
const KEPT = ["description", "argument-hint", "arguments", "license", "disable-model-invocation"];

/** An argument name the manifest takes and a `{{name}}` placeholder can carry both ways. */
const ARG_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * The short name a command file suggests, from its path under `commands/`: a subfolder joins it
 * (`review/diff.md` → `review-diff`, which Claude Code calls `/review:diff`).
 */
export const commandName = (pathUnderCommands: string): string =>
  toItemName(pathUnderCommands.replace(/\.md$/, "").split("/").join("-"));

/**
 * A Claude Code command (`.claude/commands/**\/*.md`) as an item (native-readers.md §6): the body is
 * `command.md` with each declared argument's `$name` as `{{name}}`; positional placeholders stay as
 * written. Other fields are dropped with a warning each.
 */
export const readCommand = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, body } = splitMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];

  const described = descriptionOf(data?.description, body, source, true);
  warnings.push(...described.warnings);

  const hint = typeof data?.["argument-hint"] === "string" ? data["argument-hint"] : "";
  const args: { name: string; required: boolean }[] = [];
  let text = body;
  for (const name of listOf(data?.arguments, /[\s,]+/)) {
    if (!ARG_NAME.test(name)) {
      warnings.push({
        code: "field_dropped",
        message: `The argument \`${name}\` was left out: an argument's name is lowercase letters, digits and _, starting with a letter. Its placeholder stays as written.`,
        file: source,
      });
      continue;
    }
    args.push({ name, required: hint.includes(`<${name}>`) });
    // The name is checked above, so it's safe in a pattern; an escaped `\$name` stays.
    text = text.replace(new RegExp(`(?<!\\\\)\\$${name}(?![A-Za-z0-9_])`, "g"), `{{${name}}}`);
  }
  if (/(?<!\\)\$(?:\d|ARGUMENTS\[)/.test(text))
    warnings.push({
      code: "field_dropped",
      message: `${source} uses positional placeholders ($0, $ARGUMENTS[N]); they stay as written and work only in Claude Code.`,
      file: source,
    });

  const references = listOf(data?.["allowed-tools"], /[\s,]+/)
    .map(mcpServerOf)
    .filter((server): server is string => server !== null)
    .filter((server, i, all) => all.indexOf(server) === i)
    .map((name) => ({ kind: "mcp-server" as const, name, from: "allowed-tools" }));

  if (data?.["disable-model-invocation"] !== true)
    warnings.push({
      code: "field_dropped",
      message: `${source} can also be run by the model when it's relevant; installed from Ronne, a command is run only by the person.`,
      file: source,
    });
  warnings.push(...droppedFields(data, KEPT, source, "command"));

  const manifest: Manifest = { name: options.itemName, type: "command" };
  if (described.description) manifest.description = described.description;
  if (typeof data?.license === "string" && data.license.trim())
    manifest.license = data.license.trim();
  manifest.command = { body: "command.md", ...(args.length > 0 ? { args } : {}) };
  return result(manifest, [{ path: "command.md", text }], warnings, references);
};
