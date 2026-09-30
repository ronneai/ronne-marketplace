import type { Manifest } from "../../manifest.js";
import type { PackageFile } from "../../package-file.js";
import {
  checkedName,
  descriptionOf,
  droppedFields,
  result,
  textOf,
} from "../claude-code/shared.js";
import type { ReadResult, ReadWarning } from "../types.js";
import { cursorMarkdown } from "./shared.js";

/**
 * A Cursor rule (`.cursor/rules/**\/*.mdc`) as an item (native-readers.md §10): `alwaysApply: true`
 * is `always`; else `globs` is `glob`; else a description is `model`; else `manual`.
 */
export const readCursorRule = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, globs, hasFrontmatter, body } = cursorMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];
  if (hasFrontmatter && data === null)
    warnings.push({
      code: "field_dropped",
      message: `${source}'s frontmatter isn't valid YAML, so it's read as a rule applied by hand.`,
      file: source,
    });
  warnings.push(...droppedFields(data, ["description", "alwaysApply"], source, "rule"));

  const describedHere = typeof data?.description === "string" && data.description.trim() !== "";
  const described = descriptionOf(data?.description, body, source, true);
  // A rule always had a first line to describe it; only a missing description is worth a warning.
  warnings.push(...described.warnings.filter((w) => w.code !== "description_from_body"));

  let rule: Record<string, unknown>;
  if (data?.alwaysApply === true) {
    rule = { body: "rule.md", activation: "always" };
    if (globs?.length)
      warnings.push({
        code: "field_dropped",
        message: `${source} applies always, so its globs were left out, as Cursor ignores them.`,
        file: source,
      });
  } else if (globs?.length) rule = { body: "rule.md", activation: "glob", globs };
  else if (describedHere) rule = { body: "rule.md", activation: "model" };
  else rule = { body: "rule.md", activation: "manual" };

  const manifest: Manifest = { name: options.itemName, type: "rule" };
  if (described.description) manifest.description = described.description;
  manifest.rule = rule;
  return result(manifest, [{ path: "rule.md", text: body }], warnings, []);
};
