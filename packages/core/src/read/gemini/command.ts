import { parse } from "smol-toml";
import type { Manifest } from "../../manifest.js";
import type { PackageFile } from "../../package-file.js";
import { checkedName, result, textOf } from "../claude-code/shared.js";
import { fitDescription, toItemName } from "../text.js";
import { ReadError, type ReadResult, type ReadWarning } from "../types.js";

/** A command's name from its path under `commands/`: `git/commit.toml` is `git-commit`. */
export const geminiCommandName = (pathUnderCommands: string): string =>
  toItemName(
    pathUnderCommands
      .replace(/\.toml$/, "")
      .split("/")
      .join("-"),
  );

/**
 * A Gemini CLI command (`.gemini/commands/**\/*.toml`, `~/.gemini/commands/`) as an item
 * (native-readers.md §14): `prompt` is `command.md`, and `{{args}}`, where Gemini CLI puts what the
 * person typed, is one argument named `args`. `!{…}` and `@{…}` stay as written, with a warning:
 * only Gemini CLI runs or reads them.
 */
export const readGeminiCommand = (file: PackageFile, options: { itemName: string }): ReadResult => {
  checkedName(options.itemName);
  const source = file.path.split("/").at(-1) ?? file.path;
  let data: Record<string, unknown>;
  try {
    data = parse(textOf(file)) as Record<string, unknown>;
  } catch (error) {
    throw new ReadError(
      "manifest_invalid",
      `${source} isn't valid TOML: ${(error as Error).message}`,
    );
  }
  if (typeof data.prompt !== "string")
    throw new ReadError("manifest_invalid", `${source} has no prompt.`);
  const warnings: ReadWarning[] = [];
  for (const key of Object.keys(data).filter((k) => k !== "prompt" && k !== "description"))
    warnings.push({
      code: "field_dropped",
      message: `${source}'s \`${key}\` was left out: a command in Ronne has no such field.`,
      file: source,
    });
  const prompt = data.prompt;
  if (prompt.includes("!{") || prompt.includes("@{"))
    warnings.push({
      code: "field_dropped",
      message: `${source} runs a shell command (\`!{…}\`) or reads a file (\`@{…}\`) when it's used; that text stays as written, and only Gemini CLI acts on it.`,
      file: source,
    });

  const manifest: Manifest = { name: options.itemName, type: "command" };
  let describedHere = false;
  if (typeof data.description === "string" && data.description.trim()) {
    const fitted = fitDescription(data.description);
    manifest.description = fitted.text;
    describedHere = true;
    if (fitted.cut)
      warnings.push({
        code: "description_cut",
        message: "The description is longer than 300 characters, so it was cut short.",
        file: source,
      });
  }
  manifest.command = {
    body: "command.md",
    ...(prompt.includes("{{args}}") ? { args: [{ name: "args", required: false }] } : {}),
  };
  return result(
    manifest,
    [{ path: "command.md", text: prompt }],
    warnings,
    [],
    describedHere ? "item" : "none",
  );
};
