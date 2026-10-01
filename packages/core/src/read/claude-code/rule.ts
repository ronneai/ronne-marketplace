import type { Manifest } from "../../manifest.js";
import type { PackageFile } from "../../package-file.js";
import { firstLine, fitDescription } from "../text.js";
import type { ReadResult, ReadWarning } from "../types.js";
import { checkedName, droppedFields, listOf, result, splitMarkdown, textOf } from "./shared.js";

export { commandName as ruleName } from "./command.js";

/**
 * A Claude Code rule (`.claude/rules/**\/*.md`) as an item (native-readers.md §7). `paths` is the
 * only field Claude Code reads: with it the rule applies to those globs, without it always. The
 * body is `rule.md`, and its first heading or line is the description.
 */
export const readRule = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, yaml, body } = splitMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];

  if (yaml !== null && data === null)
    warnings.push({
      code: "field_dropped",
      message: `${source}'s frontmatter isn't valid YAML, so Claude Code ignores it and the rule applies always; it's exported that way.`,
      file: source,
    });
  warnings.push(...droppedFields(data, ["paths"], source, "rule"));

  const manifest: Manifest = { name: options.itemName, type: "rule" };
  const line = firstLine(body);
  if (line) {
    const fitted = fitDescription(line);
    manifest.description = fitted.text;
    if (fitted.cut)
      warnings.push({
        code: "description_cut",
        message:
          "The rule's first line is longer than 300 characters, so the description is cut short.",
        file: "ronne.yaml",
      });
  }
  const globs = listOf(data?.paths);
  manifest.rule =
    globs.length > 0
      ? { body: "rule.md", activation: "glob", globs }
      : { body: "rule.md", activation: "always" };
  // A Claude Code rule has no description of its own: it's always its first line (053).
  return result(manifest, [{ path: "rule.md", text: body }], warnings, [], "body");
};
