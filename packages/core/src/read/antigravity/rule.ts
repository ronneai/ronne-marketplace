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

/** Antigravity's triggers as the manifest's activations (rules, 2026-11-22). */
const ACTIVATIONS: Record<string, string> = {
  always_on: "always",
  glob: "glob",
  model_decision: "model",
  manual: "manual",
};

/**
 * An Antigravity rule (`.agents/rules/*.md`, `~/.gemini/config/rules/`) as an item
 * (native-readers.md §13): `trigger` gives the activation and `globs` (or `glob`), comma-separated,
 * the files. A missing or unknown `trigger` makes Antigravity drop the rule, so it's read as
 * `manual`, with a warning.
 */
export const readAntigravityRule = (
  file: PackageFile,
  options: { itemName: string },
): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  const { data, body } = splitMarkdown(textOf(file));
  const warnings: ReadWarning[] = [];
  warnings.push(
    ...droppedFields(data, ["trigger", "globs", "glob", "description"], source, "rule"),
  );
  const describedHere = typeof data?.description === "string" && data.description.trim() !== "";
  const described = descriptionOf(data?.description, body, source, true);
  warnings.push(...described.warnings.filter((w) => w.code !== "description_from_body"));

  const trigger = typeof data?.trigger === "string" ? data.trigger.trim() : "";
  let activation = Object.hasOwn(ACTIVATIONS, trigger) ? ACTIVATIONS[trigger] : undefined;
  if (!activation) {
    warnings.push({
      code: "field_dropped",
      message: `${source} has ${trigger ? `the trigger \`${trigger}\`, which Antigravity doesn't know` : "no trigger"}, so Antigravity doesn't load it; it's read as a rule applied by hand.`,
      file: source,
    });
    activation = "manual";
  }
  const globs = listOf(data?.globs ?? data?.glob);
  const rule: Record<string, unknown> = { body: "rule.md", activation };
  if (activation === "glob") {
    if (globs.length) rule.globs = globs;
    else {
      rule.activation = "manual";
      warnings.push({
        code: "field_dropped",
        message: `${source} applies to files by glob but names none, so it's read as a rule applied by hand.`,
        file: source,
      });
    }
  }

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
