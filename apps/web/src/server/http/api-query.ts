import { type ItemType, isItemType, NAME_MAX_LENGTH, normalizeWorkspaceName } from "@ronneai/core";
import { RENDERERS, rendererById } from "@ronneai/core/render";

/**
 * Query-string parsing for `/api/v1` (MVP §11, feature 019). Unlike the web pages, which drop what
 * they don't understand, the API refuses it, so scripts find their mistakes.
 */
export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = <T>(message: string): Parsed<T> => ({ ok: false, message });

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** `?limit=`: 1 to 100, 20 when absent. */
export const parseLimit = (value: string | null): Parsed<number> => {
  if (value === null || value === "") return ok(DEFAULT_LIMIT);
  if (!/^\d+$/.test(value)) return fail("`limit` must be a whole number.");
  const limit = Number(value);
  if (limit < 1 || limit > MAX_LIMIT) return fail(`\`limit\` must be between 1 and ${MAX_LIMIT}.`);
  return ok(limit);
};

/** `?type=`: one of the item types, or none. */
export const parseType = (value: string | null): Parsed<ItemType | null> => {
  if (value === null || value === "") return ok(null);
  return isItemType(value) ? ok(value) : fail(`\`type\` must be an item type; ${value} isn't one.`);
};

/** `?tool=`: a renderer id (026), or none. */
export const parseTool = (value: string | null): Parsed<string | null> => {
  if (value === null || value === "") return ok(null);
  if (rendererById(value)) return ok(value);
  const ids = RENDERERS.map((r) => r.id).join(", ");
  return fail(`\`tool\` must be one of ${ids}; ${value} isn't one.`);
};

/** `?sort=`: `recent` (the default) or `name`. */
export const parseSort = (value: string | null): Parsed<"recent" | "name"> => {
  if (value === null || value === "" || value === "recent") return ok("recent");
  if (value === "name") return ok("name");
  return fail("`sort` must be `recent` or `name`.");
};

/** `?q=`: trimmed, at most 100 characters. */
export const parseSearch = (value: string | null): Parsed<string> => {
  const q = (value ?? "").trim();
  return q.length > 100 ? fail("`q` must be at most 100 characters.") : ok(q);
};

/**
 * `?workspace=`: a workspace's name (095), or none. Trimmed and lowercased; a name no workspace has,
 * or a private one the caller isn't in, matches nothing, as in the catalogue (093).
 */
export const parseWorkspace = (value: string | null): Parsed<string | null> => {
  const name = normalizeWorkspaceName(value ?? "");
  if (name === "") return ok(null);
  return name.length > NAME_MAX_LENGTH
    ? fail(`\`workspace\` must be at most ${NAME_MAX_LENGTH} characters.`)
    : ok(name);
};
