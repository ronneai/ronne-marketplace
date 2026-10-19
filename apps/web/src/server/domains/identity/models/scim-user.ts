import { InvalidEmailError } from "../exceptions/errors";
import { normalizeEmail } from "./user";

/**
 * SCIM Users as Ronne reads and writes them (RFC 7643 §4.1, feature 108): what a provider's
 * request body, filter or PATCH means, and how a link and its account are shown back. Nothing here
 * touches storage, so every shape Entra and Okta send can be checked on its own.
 */
export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

/** RFC 7644 §3.12's `scimType`s that Ronne answers with. */
export type ScimType =
  | "invalidFilter"
  | "tooMany"
  | "uniqueness"
  | "mutability"
  | "invalidSyntax"
  | "invalidPath"
  | "noTarget"
  | "invalidValue";

/** A request the provider sent that can't be done, answered in SCIM's error format. */
export class ScimRequestError extends Error {
  override readonly name: string = "ScimRequestError";
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly scimType?: ScimType,
  ) {
    super(detail);
  }
}

/** The `scim_users` columns are this long; a longer name is cut, never refused. */
export const SCIM_NAME_MAX_LENGTH = 100;
export const SCIM_EXTERNAL_ID_MAX_LENGTH = 255;

/** What a create or a replace sets: the fields the provider manages. */
export type ScimUserInput = {
  /** The email, lowercased. */
  userName: string;
  externalId: string | null;
  active: boolean;
  givenName: string | null;
  familyName: string | null;
  displayName: string | null;
};

/** What a PATCH changes: only the fields it names. */
export type ScimUserPatch = Partial<ScimUserInput>;

const invalid = (detail: string) => new ScimRequestError(400, detail, "invalidValue");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Printable ASCII only (no space, no control character): what 106's sign-in takes as an address. */
const PLAIN_EMAIL = /^[\x21-\x7e]+$/;

/**
 * A `userName` as the email it is: only ASCII spaces around it are trimmed, anything that isn't
 * plain ASCII is refused (lowercasing would fold the Kelvin sign into `k` and hand a provider's
 * `Kate@…` someone else's `kate@…`, as 106's spec says), then lowercased and validated as sign-in
 * does. Every match on it compares this value byte for byte.
 */
export const parseUserName = (value: unknown): string => {
  if (typeof value !== "string") throw invalid("userName must be the person's email address");
  const raw = value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if ([...raw].some((c) => (c.codePointAt(0) ?? 0) > 0x7f))
    throw invalid("userName must be a plain ASCII email address");
  if (!PLAIN_EMAIL.test(raw)) throw invalid("userName must be an email address");
  try {
    return normalizeEmail(raw);
  } catch (error) {
    if (error instanceof InvalidEmailError) throw invalid("userName must be an email address");
    throw error;
  }
};

/** `active`, as a boolean or as the `"True"`/`"False"` strings Entra sends. */
export const parseActive = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const word = value.trim().toLowerCase();
    if (word === "true") return true;
    if (word === "false") return false;
  }
  throw invalid("active must be true or false");
};

const cut = (value: string, max: number): string => {
  const chars = [...value];
  return chars.length > max ? chars.slice(0, max).join("") : value;
};

/** A name part: a non-empty string, cut to the column; anything else is "none". */
const namePart = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : cut(trimmed, SCIM_NAME_MAX_LENGTH);
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

/** The address in `emails`: the primary one, or the first. Null when there's none. */
const primaryEmail = (value: unknown): unknown => {
  if (!Array.isArray(value)) return isRecord(value) ? value.value : value;
  const entries = value.filter(isRecord);
  const primary = entries.find((e) => e.primary === true) ?? entries[0];
  return primary?.value;
};

/**
 * A `POST` or `PUT` body: `userName` (required), `externalId`, `active` (true unless said), the
 * name (`displayName`, `name.givenName`, `name.familyName`). Unknown attributes, `password`,
 * `roles`, `groups` and the enterprise extension are ignored.
 */
export const parseScimUser = (body: unknown): ScimUserInput => {
  if (!isRecord(body)) throw new ScimRequestError(400, "Send a SCIM User.", "invalidSyntax");
  if (body.userName === undefined) throw invalid("userName is required");
  const name = isRecord(body.name) ? body.name : {};
  return {
    userName: parseUserName(body.userName),
    externalId: parseExternalId(body.externalId),
    active: body.active === undefined ? true : parseActive(body.active),
    givenName: namePart(name.givenName),
    familyName: namePart(name.familyName),
    displayName: namePart(body.displayName) ?? namePart(name.formatted),
  };
};

/** The name Ronne shows: the display name, the given and family names, or the email. */
export const ronneName = (input: {
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  userName: string;
}): string =>
  input.displayName ??
  ([input.givenName, input.familyName].filter(Boolean).join(" ") || input.userName);

/** An attribute path as the provider wrote it, lowercased, without the User schema's URN prefix. */
const attributePath = (path: string): string => {
  const lower = path.trim().toLowerCase();
  const prefix = `${SCIM_USER_SCHEMA.toLowerCase()}:`;
  return lower.startsWith(prefix) ? lower.slice(prefix.length) : lower;
};

const EMAIL_PATH = /^emails(\[[^\]]*\])?(\.value)?$/;

/** Applies one attribute (from a path or a value object's key) to the patch being built. */
const applyAttribute = (
  patch: ScimUserPatch,
  path: string,
  value: unknown,
  remove: boolean,
): void => {
  if (path === "active") {
    if (remove) throw new ScimRequestError(400, "active can't be removed", "mutability");
    patch.active = parseActive(value);
  } else if (path === "username") {
    if (remove) throw new ScimRequestError(400, "userName can't be removed", "mutability");
    patch.userName = parseUserName(value);
  } else if (EMAIL_PATH.test(path)) {
    if (remove) return;
    const email = primaryEmail(value);
    if (email !== undefined) patch.userName = parseUserName(email);
  } else if (path === "externalid") {
    patch.externalId = remove ? null : parseExternalId(value);
  } else if (path === "displayname") {
    patch.displayName = remove ? null : namePart(value);
  } else if (path === "name.givenname") {
    patch.givenName = remove ? null : namePart(value);
  } else if (path === "name.familyname") {
    patch.familyName = remove ? null : namePart(value);
  } else if (path === "name") {
    if (remove) {
      patch.givenName = null;
      patch.familyName = null;
      return;
    }
    if (!isRecord(value)) throw invalid("name must be an object");
    if ("givenName" in value) patch.givenName = namePart(value.givenName);
    if ("familyName" in value) patch.familyName = namePart(value.familyName);
    if ("formatted" in value && patch.displayName === undefined)
      patch.displayName = namePart(value.formatted);
  }
  // Anything else (`id`, `groups`, `password`, `roles`, the enterprise extension, `name.formatted`
  // on its own) is read-only here or not Ronne's: ignored, as a create ignores it.
};

/**
 * A `PATCH` body (RFC 7644 §3.5.2): `replace`, `add` and `remove`, each with a path (`active`,
 * `userName`, `name.givenName`, `emails[type eq "work"].value`…) or, as Okta sends them, with no
 * path and an object of attributes. Entra's capitalised ops and string booleans are taken.
 */
export const parseUserPatch = (body: unknown): ScimUserPatch => {
  if (!isRecord(body) || !Array.isArray(body.Operations) || body.Operations.length === 0)
    throw new ScimRequestError(400, "Send a PatchOp with Operations.", "invalidSyntax");
  const patch: ScimUserPatch = {};
  for (const operation of body.Operations) {
    if (!isRecord(operation)) throw new ScimRequestError(400, "Bad operation.", "invalidSyntax");
    const op = typeof operation.op === "string" ? operation.op.toLowerCase() : "";
    if (op !== "replace" && op !== "add" && op !== "remove")
      throw new ScimRequestError(400, `Unknown op ${String(operation.op)}.`, "invalidValue");
    const remove = op === "remove";
    if (operation.path === undefined || operation.path === null) {
      if (remove) throw new ScimRequestError(400, "remove needs a path", "noTarget");
      if (!isRecord(operation.value))
        throw invalid("An operation without a path needs an object value");
      for (const [key, value] of Object.entries(operation.value))
        applyAttribute(patch, attributePath(key), value, false);
    } else {
      if (typeof operation.path !== "string")
        throw new ScimRequestError(400, "path must be a string", "invalidPath");
      applyAttribute(patch, attributePath(operation.path), operation.value, remove);
    }
  }
  return patch;
};

/** What `GET /Users?filter=` may ask: `eq` on one attribute. */
export type ScimUserFilter = {
  attribute: "userName" | "externalId" | "id";
  /** Null for a `userName` that can't be any Ronne address: nothing matches. */
  value: string | null;
};

const FILTER = /^\s*([A-Za-z][\w.]*)\s+(\w+)\s+"((?:[^"\\]|\\.)*)"\s*$/;

/**
 * The filter grammar Ronne supports (`ServiceProviderConfig` says so): `userName eq "…"`,
 * `externalId eq "…"` or `id eq "…"`, the attribute in any case. A `userName` is lowercased, so
 * Entra's `userName eq "Ann@b.com"` finds the link it made; one that isn't plain ASCII matches
 * nothing rather than being refused, since a search isn't a write.
 */
export const parseUserFilter = (filter: string): ScimUserFilter => {
  const match = FILTER.exec(filter);
  if (!match) throw new ScimRequestError(400, "Unsupported filter.", "invalidFilter");
  const [, attribute, operator, quoted] = match as unknown as [string, string, string, string];
  if (operator.toLowerCase() !== "eq")
    throw new ScimRequestError(400, `Only eq is supported, not ${operator}.`, "invalidFilter");
  const value = quoted.replace(/\\(.)/g, "$1");
  switch (attribute.toLowerCase()) {
    case "username": {
      try {
        return { attribute: "userName", value: parseUserName(value) };
      } catch (error) {
        if (error instanceof ScimRequestError) return { attribute: "userName", value: null };
        throw error;
      }
    }
    case "externalid":
      return { attribute: "externalId", value };
    case "id":
      return { attribute: "id", value };
    default:
      throw new ScimRequestError(
        400,
        "Only userName, externalId and id can be filtered.",
        "invalidFilter",
      );
  }
};

/** A SCIM user as stored: the link between a provider's user and a Ronne account. */
export type ScimUserLink = {
  id: string;
  providerId: string;
  userId: string;
  externalId: string | null;
  userName: string;
  givenName: string | null;
  familyName: string | null;
  displayName: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * An account's SCIM state, for Admin › Users (108): the provider whose link it has (at most one,
 * live or deleted), whether that link is live (*Managed by*), when it was adopted (*Adopted by*),
 * and when a DELETE deprovisioned it (*Deprovisioned by*).
 */
export type ScimAccountState = {
  providerId: string;
  providerName: string;
  managed: boolean;
  adoptedAt: Date | null;
  deprovisionedAt: Date | null;
};

/** The SCIM User resource the provider gets back (RFC 7643 §4.1). */
export const scimUserResource = (
  link: ScimUserLink,
  account: { name: string },
  base: string,
  groups: { id: string; displayName: string }[] = [],
) => ({
  schemas: [SCIM_USER_SCHEMA],
  id: link.id,
  ...(link.externalId ? { externalId: link.externalId } : {}),
  userName: link.userName,
  name: {
    formatted: link.displayName ?? account.name,
    ...(link.givenName ? { givenName: link.givenName } : {}),
    ...(link.familyName ? { familyName: link.familyName } : {}),
  },
  displayName: link.displayName ?? account.name,
  emails: [{ value: link.userName, primary: true, type: "work" }],
  active: link.active,
  groups: groups.map((g) => ({ value: g.id, display: g.displayName })),
  meta: {
    resourceType: "User",
    created: link.createdAt.toISOString(),
    lastModified: link.updatedAt.toISOString(),
    location: `${base}/Users/${link.id}`,
  },
});
