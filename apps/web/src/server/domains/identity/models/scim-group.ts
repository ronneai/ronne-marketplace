import { SCIM_EXTERNAL_ID_MAX_LENGTH, ScimRequestError } from "./scim-user";

/**
 * SCIM Groups as Ronne reads and writes them (RFC 7643 §4.2, feature 108): a body, a PATCH and a
 * filter, and the resource shown back. Members are SCIM user ids (live links of the provider).
 * Nothing here touches storage.
 */
export const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

/** Matches 106's mapping names: 1–255 characters, compared byte for byte. */
export const SCIM_GROUP_NAME_MAX_LENGTH = 255;

export type ScimGroupInput = {
  displayName: string;
  externalId: string | null;
  /** The members' SCIM user ids, in the order sent, without repeats. */
  members: string[];
};

/** One change a PATCH makes, in order. `remove` with null ids removes every member. */
export type ScimGroupChange =
  | { kind: "add"; ids: string[] }
  | { kind: "remove"; ids: string[] | null }
  | { kind: "replace"; ids: string[] }
  | { kind: "rename"; displayName: string }
  | { kind: "externalId"; externalId: string | null };

const invalid = (detail: string) => new ScimRequestError(400, detail, "invalidValue");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseDisplayName = (value: unknown): string => {
  if (typeof value !== "string") throw invalid("displayName must be a string");
  const trimmed = value.trim();
  if (trimmed.length === 0 || [...trimmed].length > SCIM_GROUP_NAME_MAX_LENGTH)
    throw invalid(`displayName must be 1 to ${SCIM_GROUP_NAME_MAX_LENGTH} characters`);
  return trimmed;
};

const parseExternalId = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw invalid("externalId must be a string");
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if ([...trimmed].length > SCIM_EXTERNAL_ID_MAX_LENGTH)
    throw invalid(`externalId must be at most ${SCIM_EXTERNAL_ID_MAX_LENGTH} characters`);
  return trimmed;
};

/**
 * Members as providers send them: `[{ value }]` (the standard), or `[ "id" ]` and a single
 * `{ value }` (Entra's older shapes). A repeat counts once.
 */
const parseMembers = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const entry of list) {
    const id = typeof entry === "string" ? entry : isRecord(entry) ? entry.value : undefined;
    if (typeof id !== "string" || id.trim().length === 0)
      throw invalid("Each member needs a value: the user's SCIM id");
    if (!ids.includes(id.trim())) ids.push(id.trim());
  }
  return ids;
};

/** A `POST` or `PUT` body: `displayName` (required), `externalId`, `members` (none when left out). */
export const parseScimGroup = (body: unknown): ScimGroupInput => {
  if (!isRecord(body)) throw new ScimRequestError(400, "Send a SCIM Group.", "invalidSyntax");
  if (body.displayName === undefined) throw invalid("displayName is required");
  return {
    displayName: parseDisplayName(body.displayName),
    externalId: parseExternalId(body.externalId),
    members: parseMembers(body.members),
  };
};

/** `members[value eq "id"]`: the one id a remove names. */
const MEMBER_FILTER = /^members\[\s*value\s+eq\s+"((?:[^"\\]|\\.)*)"\s*\]$/i;

const pathOf = (path: string) => {
  const lower = path.trim().toLowerCase();
  const prefix = `${SCIM_GROUP_SCHEMA.toLowerCase()}:`;
  return lower.startsWith(prefix) ? path.trim().slice(prefix.length) : path.trim();
};

/** Applies one attribute of a value-object operation (Okta's form, no path). */
const fromObject = (
  op: "add" | "replace",
  value: Record<string, unknown>,
  changes: ScimGroupChange[],
): void => {
  for (const [key, item] of Object.entries(value)) {
    const name = key.toLowerCase();
    if (name === "displayname")
      changes.push({ kind: "rename", displayName: parseDisplayName(item) });
    else if (name === "externalid")
      changes.push({ kind: "externalId", externalId: parseExternalId(item) });
    else if (name === "members") changes.push({ kind: op, ids: parseMembers(item) });
    // `id`, `meta`, `schemas` and anything unknown: read-only or not Ronne's, ignored.
  }
};

/**
 * A `PATCH` body (RFC 7644 §3.5.2): `add`, `remove` and `replace` on `members` (with a path, a
 * `members[value eq "…"]` filter, or a value object), and on `displayName` and `externalId`.
 * Entra's capitalised ops and Okta's value objects are taken.
 */
export const parseGroupPatch = (body: unknown): ScimGroupChange[] => {
  if (!isRecord(body) || !Array.isArray(body.Operations) || body.Operations.length === 0)
    throw new ScimRequestError(400, "Send a PatchOp with Operations.", "invalidSyntax");
  const changes: ScimGroupChange[] = [];
  for (const operation of body.Operations) {
    if (!isRecord(operation)) throw new ScimRequestError(400, "Bad operation.", "invalidSyntax");
    const op = typeof operation.op === "string" ? operation.op.toLowerCase() : "";
    if (op !== "add" && op !== "remove" && op !== "replace")
      throw new ScimRequestError(400, `Unknown op ${String(operation.op)}.`, "invalidValue");
    if (operation.path === undefined || operation.path === null) {
      if (op === "remove") throw new ScimRequestError(400, "remove needs a path", "noTarget");
      if (!isRecord(operation.value))
        throw invalid("An operation without a path needs an object value");
      fromObject(op, operation.value, changes);
      continue;
    }
    if (typeof operation.path !== "string")
      throw new ScimRequestError(400, "path must be a string", "invalidPath");
    const path = pathOf(operation.path);
    const filtered = MEMBER_FILTER.exec(path);
    if (filtered) {
      if (op !== "remove")
        throw new ScimRequestError(400, "A member filter can only be removed.", "invalidPath");
      changes.push({ kind: "remove", ids: [(filtered[1] ?? "").replace(/\\(.)/g, "$1")] });
      continue;
    }
    switch (path.toLowerCase()) {
      case "members":
        if (op === "remove")
          changes.push({
            kind: "remove",
            ids: operation.value === undefined ? null : parseMembers(operation.value),
          });
        else changes.push({ kind: op, ids: parseMembers(operation.value) });
        break;
      case "displayname":
        if (op === "remove")
          throw new ScimRequestError(400, "displayName can't be removed", "mutability");
        changes.push({ kind: "rename", displayName: parseDisplayName(operation.value) });
        break;
      case "externalid":
        changes.push({
          kind: "externalId",
          externalId: op === "remove" ? null : parseExternalId(operation.value),
        });
        break;
      default:
        throw new ScimRequestError(400, `Unknown path ${operation.path}.`, "invalidPath");
    }
  }
  return changes;
};

/** What `GET /Groups?filter=` may ask: `eq` on one attribute. */
export type ScimGroupFilter = { attribute: "displayName" | "externalId" | "id"; value: string };

const FILTER = /^\s*([A-Za-z][\w.]*)\s+(\w+)\s+"((?:[^"\\]|\\.)*)"\s*$/;

export const parseGroupFilter = (filter: string): ScimGroupFilter => {
  const match = FILTER.exec(filter);
  if (!match) throw new ScimRequestError(400, "Unsupported filter.", "invalidFilter");
  const [, attribute, operator, quoted] = match as unknown as [string, string, string, string];
  if (operator.toLowerCase() !== "eq")
    throw new ScimRequestError(400, `Only eq is supported, not ${operator}.`, "invalidFilter");
  const value = quoted.replace(/\\(.)/g, "$1");
  switch (attribute.toLowerCase()) {
    case "displayname":
      return { attribute: "displayName", value };
    case "externalid":
      return { attribute: "externalId", value };
    case "id":
      return { attribute: "id", value };
    default:
      throw new ScimRequestError(
        400,
        "Only displayName, externalId and id can be filtered.",
        "invalidFilter",
      );
  }
};

export type ScimGroupRow = {
  id: string;
  providerId: string;
  displayName: string;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** The SCIM Group resource (RFC 7643 §4.2); `members` left out when the provider asked so. */
export const scimGroupResource = (
  group: ScimGroupRow,
  members: { id: string; display: string }[] | null,
  base: string,
) => ({
  schemas: [SCIM_GROUP_SCHEMA],
  id: group.id,
  ...(group.externalId ? { externalId: group.externalId } : {}),
  displayName: group.displayName,
  ...(members
    ? {
        members: members.map((m) => ({
          value: m.id,
          display: m.display,
          $ref: `${base}/Users/${m.id}`,
        })),
      }
    : {}),
  meta: {
    resourceType: "Group",
    created: group.createdAt.toISOString(),
    lastModified: group.updatedAt.toISOString(),
    location: `${base}/Groups/${group.id}`,
  },
});

/**
 * The names a group goes by for 106's mappings: its display name, and its external id (Entra's
 * groups claim, and so its mappings, name groups by object id).
 */
export const groupNames = (group: { displayName: string; externalId: string | null }) =>
  group.externalId ? [group.displayName, group.externalId] : [group.displayName];
