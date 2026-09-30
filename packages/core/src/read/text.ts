import { isValidName, NAME_MAX_LENGTH } from "../names.js";

/** The manifest's limit on `description` (manifest spec §1). */
export const DESCRIPTION_MAX_LENGTH = 300;

/**
 * A native name as an item name: as it is when it's valid, else lowercase with `-` for every other
 * character (`My Skill!` → `my-skill`). Empty when nothing usable is left.
 */
export const toItemName = (value: string): string => {
  if (isValidName(value, "item")) return value;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_MAX_LENGTH)
    .replace(/-+$/, "");
};

/** On one line, whitespace collapsed. */
export const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * A description that fits the manifest: at most 300 characters, cut at a word and ended with `…`
 * when it's longer. `cut` says whether it was.
 */
export const fitDescription = (value: string): { text: string; cut: boolean } => {
  const text = oneLine(value);
  if (text.length <= DESCRIPTION_MAX_LENGTH) return { text, cut: false };
  const room = text.slice(0, DESCRIPTION_MAX_LENGTH - 1);
  const space = room.lastIndexOf(" ");
  return { text: `${(space > 0 ? room.slice(0, space) : room).trimEnd()}…`, cut: true };
};

/** A Markdown body's first line of text, without heading marks, or "". */
export const firstLine = (body: string): string => {
  for (const line of body.split(/\r?\n/)) {
    const text = oneLine(line.replace(/^#+\s*/, ""));
    if (text) return text;
  }
  return "";
};
