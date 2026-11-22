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
import type { ReadResult, ReadWarning } from "../types.js";

/**
 * A Copilot instructions file (`.github/instructions/*.instructions.md`, `~/.copilot/instructions/`)
 * as a rule (native-readers.md §11): `applyTo: "**"` is `always`; other globs, comma-separated, are
 * `glob`; none at all is `manual`, since Copilot then applies it only when it's attached by hand.
 */
export const readCopilotRule = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, yaml, body } = splitMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];
  if (yaml !== null && data === null)
    warnings.push({
      code: "field_dropped",
      message: `${source}'s frontmatter isn't valid YAML, so it's read as a rule applied by hand.`,
      file: source,
    });
  warnings.push(...droppedFields(data, ["applyTo", "description"], source, "rule"));

  const describedHere = typeof data?.description === "string" && data.description.trim() !== "";
  const described = descriptionOf(data?.description, body, source, true);
  warnings.push(...described.warnings.filter((w) => w.code !== "description_from_body"));

  const globs = listOf(data?.applyTo)
    .map((glob) => glob.trim())
    .filter(Boolean);
  const rule: Record<string, unknown> = !globs.length
    ? { body: "rule.md", activation: "manual" }
    : globs.includes("**")
      ? { body: "rule.md", activation: "always" }
      : { body: "rule.md", activation: "glob", globs };

  const manifest: Manifest = { name: options.itemName, type: "rule" };
  if (described.description) manifest.description = described.description;
  manifest.rule = rule;
  return result(
    manifest,
    [{ path: "rule.md", text: body }],
    warnings,
    [],
    describedHere ? "item" : "body",
  );
};
