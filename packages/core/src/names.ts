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

/** The workspace every instance has (090), which item names leave out (118). */
export const GLOBAL_WORKSPACE = "global";

/**
 * An item's full name, in parts (118): its workspace, scope and name. `@scope/name` is short for
 * `@global/scope/name`; any other workspace is written out, `@workspace/scope/name`.
 */
export type ItemRef = { workspace: string; scope: string; name: string };

/** A scope, in parts (118): `@scope` is in `global`, `@workspace/scope` in that workspace. */
export type ScopeRef = { workspace: string; scope: string };

/** The longest full item name: `@` and three names with two slashes. */
export const ITEM_NAME_MAX_LENGTH = 1 + 3 * NAME_MAX_LENGTH + 2;

/** `@a/b` or `@a/b/c` split into its names, or null. Split, not matched, so no pattern backtracks. */
const segments = (value: string, max: number): string[] | null => {
  if (!value.startsWith("@") || value.length > max) return null;
  const parts = value.slice(1).split("/");
  return parts.every((part) => isValidName(part, "item")) ? parts : null;
};

/**
 * A full item name → its parts, or null when it isn't one (118). Two names are a `global` item,
 * three name the workspace too; the count decides, never what exists or who reads it.
 */
export const parseItemName = (value: string): ItemRef | null => {
  const parts = segments(value, ITEM_NAME_MAX_LENGTH);
  if (parts?.length === 2) {
    const [scope = "", name = ""] = parts;
    return { workspace: GLOBAL_WORKSPACE, scope, name };
  }
  if (parts?.length === 3) {
    const [workspace = "", scope = "", name = ""] = parts;
    return { workspace, scope, name };
  }
  return null;
};

/** An item's parts → its full name, short (`@scope/name`) in `global` (118). */
export const formatItemName = (ref: {
  workspace?: string | null;
  scope: string;
  name: string;
}): string =>
  !ref.workspace || ref.workspace === GLOBAL_WORKSPACE
    ? `@${ref.scope}/${ref.name}`
    : `@${ref.workspace}/${ref.scope}/${ref.name}`;

/** The one way a name is written (`@global/a/b` is `@a/b`), or null when it isn't an item name. */
export const canonicalItemName = (value: string): string | null => {
  const ref = parseItemName(value);
  return ref ? formatItemName(ref) : null;
};

/** The item's own name, its last part: `lint` in `@test/lint` and in `@acme/test/lint` (118). */
export const shortItemName = (value: string): string => value.slice(value.lastIndexOf("/") + 1);

/**
 * A search as a name being typed (056, 118), split on its slashes: `team/re` is a scope with `team`
 * and a name with `re`; `acme/team/re` names the workspace too. Null for a single word, which
 * searches every column. Parts may be partial or empty: they're searched, not checked.
 */
export const typedNameParts = (
  value: string,
): { workspace: string | null; scope: string; name: string } | null => {
  const parts = value.trim().replace(/^@/, "").split("/");
  if (parts.length === 2) return { workspace: null, scope: parts[0] ?? "", name: parts[1] ?? "" };
  if (parts.length > 2)
    return { workspace: parts[0] ?? "", scope: parts[1] ?? "", name: parts.slice(2).join("/") };
  return null;
};

/** Whether two strings name the same item, however each is written. */
export const sameItemName = (a: string, b: string): boolean => {
  const left = canonicalItemName(a);
  return left !== null && left === canonicalItemName(b);
};

/** `@scope` or `@workspace/scope` → its parts, or null (118: `rmk export --to`). */
export const parseScopeName = (value: string): ScopeRef | null => {
  const parts = segments(value, 1 + 2 * NAME_MAX_LENGTH + 1);
  if (parts?.length === 1) return { workspace: GLOBAL_WORKSPACE, scope: parts[0] ?? "" };
  if (parts?.length === 2) {
    const [workspace = "", scope = ""] = parts;
    return { workspace, scope };
  }
  return null;
};

/**
 * What a person typed or a form sent, as a scope (118): trimmed and lowercased, with or without its
 * `@`; `team` and `@team` are `global`'s, `@acme/team` is acme's. Null when it isn't a scope name.
 */
export const scopeRefFrom = (value: string): ScopeRef | null => {
  const typed = value.trim().toLowerCase();
  return parseScopeName(typed.startsWith("@") ? typed : `@${typed}`);
};

/** A scope's parts → `@scope` in `global`, `@workspace/scope` elsewhere (118). */
export const formatScopeName = (ref: { workspace?: string | null; scope: string }): string =>
  !ref.workspace || ref.workspace === GLOBAL_WORKSPACE
    ? `@${ref.scope}`
    : `@${ref.workspace}/${ref.scope}`;
