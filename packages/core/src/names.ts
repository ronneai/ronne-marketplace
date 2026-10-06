/**
 * Scope, item and workspace names (manifest spec §1, features 010 and 090): lowercase `a-z`, `0-9` and `-`, 1–64
 * characters, not starting or ending with `-`. One implementation, shared by the web app, `rmk`
 * and the schema checks (011), so they always agree.
 */
export const NAME_MAX_LENGTH = 64;

const NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Scopes nobody may create, so an item can't pass itself off as part of Ronne or the instance.
 */
export const RESERVED_SCOPES: readonly string[] = [
  "ronne",
  "ronneai",
  "rmk",
  "admin",
  "root",
  "system",
  "api",
  "www",
  "internal",
];

/**
 * Workspaces nobody may create (feature 090): `global`, which every instance has, and the reserved
 * scope names, for the same reason. A workspace and a scope may still share any other name.
 */
export const RESERVED_WORKSPACES: readonly string[] = ["global", ...RESERVED_SCOPES];

export type NameKind = "scope" | "item" | "workspace";

export type NameProblem = "empty" | "too_long" | "characters" | "edges" | "reserved";

/** Why a name is invalid, or null when it's fine. `reserved` applies to scopes and workspaces. */
export const nameProblem = (name: string, kind: NameKind = "item"): NameProblem | null => {
  if (name.length === 0) return "empty";
  if (name.length > NAME_MAX_LENGTH) return "too_long";
  if (!/^[a-z0-9-]+$/.test(name)) return "characters";
  if (!NAME.test(name)) return "edges";
  if (kind === "scope" && RESERVED_SCOPES.includes(name)) return "reserved";
  if (kind === "workspace" && RESERVED_WORKSPACES.includes(name)) return "reserved";
  return null;
};

export const isValidName = (name: string, kind: NameKind = "item"): boolean =>
  nameProblem(name, kind) === null;

/** What a person typed, as a scope name: trimmed, lowercased, without a leading `@`. */
export const normalizeScopeName = (value: string): string =>
  value.trim().replace(/^@/, "").toLowerCase();

/** What a person typed, as a workspace name: trimmed and lowercased (workspaces have no `@`). */
export const normalizeWorkspaceName = (value: string): string => value.trim().toLowerCase();

/** One plain sentence for each problem, for forms and error messages. */
export const NAME_PROBLEM_MESSAGES: Record<NameProblem, string> = {
  empty: "Enter a name.",
  too_long: `Use at most ${NAME_MAX_LENGTH} characters.`,
  characters: "Use only lowercase letters, digits and hyphens.",
  edges: "Don't start or end with a hyphen.",
  reserved: "That name is reserved.",
};

/** `@scope/name` → its parts, or null when it isn't a valid full item name. */
export const parseItemName = (value: string): { scope: string; name: string } | null => {
  const match = /^@([^/]+)\/([^/]+)$/.exec(value);
  if (!match) return null;
  const [, scope = "", name = ""] = match;
  return isValidName(scope, "item") && isValidName(name, "item") ? { scope, name } : null;
};
