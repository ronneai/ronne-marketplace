// What the logger writes for a value (feature 100): the logger, not each caller, keeps secrets out.
// Keys that name a secret are replaced whatever their value, at any depth; access tokens and URL
// passwords are taken out of any string, error messages included; long strings are cut; and what
// JSON can't hold (a cycle, a BigInt) becomes a marker, never an exception.

export const REDACTED = "[redacted]";
export const UNSERIALISABLE = "[unserialisable]";
export const MAX_STRING = 2000;

/**
 * Field names that hold a secret, matched case-insensitively, as the whole name or its end, plural
 * too (`csrfToken`, `cookies`).
 */
const SECRET_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "passphrase",
  "apikey",
] as const;

export const isSecretKey = (key: string): boolean => {
  const name = key.toLowerCase().replaceAll(/[_-]/g, "");
  return SECRET_KEYS.some((secret) => name.endsWith(secret) || name.endsWith(`${secret}s`));
};

/** An access token (feature 009): `rmk_` and 43 base64url characters. */
const ACCESS_TOKEN = /rmk_[A-Za-z0-9_-]{43}/g;

const isSpace = (char: string) => char.trim() === "";

/**
 * Every URL password hidden as `redactDatabaseUrl` does (`scheme://user:***@host`). A loop, not a
 * regex, so a long message costs one pass (docs/knowledge/codeql-regex.md). After each `://`, up to
 * the first `@` or space: when a `:` comes before that `@`, everything from the `:` to the last `@`
 * before a space is the password (an unencoded `@` or `/` in it is hidden too; at worst a little
 * more is).
 */
const redactUrlPasswords = (value: string): string => {
  let out = "";
  let from = 0;
  for (let at = value.indexOf("://"); at !== -1; at = value.indexOf("://", from)) {
    let end = at + 3;
    let colon = -1;
    for (; end < value.length && value[end] !== "@" && !isSpace(value.charAt(end)); end++)
      if (colon === -1 && value[end] === ":") colon = end;
    if (value[end] === "@" && colon !== -1) {
      let lastAt = end;
      for (let i = end + 1; i < value.length && !isSpace(value.charAt(i)); i++)
        if (value[i] === "@") lastAt = i;
      out += `${value.slice(from, colon)}:***@`;
      from = lastAt + 1;
    } else {
      // No password here, nor after any later `://` before `end`: its `:` would have been seen.
      const next = value[end] === "@" ? end + 1 : end;
      out += value.slice(from, next);
      from = next;
    }
  }
  return out + value.slice(from);
};

/** A string with every access token and URL password taken out, cut to MAX_STRING characters. */
export const redactString = (value: string): string => {
  const clean = redactUrlPasswords(value.replace(ACCESS_TOKEN, "rmk_[redacted]"));
  return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
};

class Unserialisable extends Error {}

/**
 * An error as a line holds it: `{ name, message, code }`, with the stack only when asked for (lines
 * at `error`). A thrown value that isn't an Error is logged as its type only: it could be anything.
 */
export const errorFields = (error: unknown, withStack: boolean): Record<string, unknown> => {
  if (!(error instanceof Error)) return { type: error === null ? "null" : typeof error };
  const code = (error as { code?: unknown }).code;
  return {
    name: redactString(error.name),
    message: redactString(error.message),
    ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    ...(withStack && error.stack ? { stack: redactString(error.stack) } : {}),
  };
};

const clean = (value: unknown, seen: Set<object>, withStack: boolean): unknown => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return redactString(value);
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol")
    return undefined;
  if (typeof value === "bigint") throw new Unserialisable();
  if (value instanceof Error) return errorFields(value, withStack);
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  if (seen.has(value)) throw new Unserialisable();
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => clean(item, seen, withStack) ?? null);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSecretKey(key)) out[key] = REDACTED;
      else {
        const cleaned = clean(item, seen, withStack);
        if (cleaned !== undefined) out[key] = cleaned;
      }
    }
    return out;
  } finally {
    seen.delete(value);
  }
};

/**
 * The fields of a line as JSON can hold them: each secret key redacted at any depth, each string
 * cleaned, errors as `errorFields`. A field that can't be written (a cycle, a BigInt) is
 * UNSERIALISABLE on its own; the others are kept. Never throws.
 */
export const cleanFields = (
  fields: Record<string, unknown>,
  withStack: boolean,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isSecretKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    try {
      // `err` is what was thrown: an Error as errorFields, anything else as its type only.
      const cleaned =
        key === "err" ? errorFields(value, withStack) : clean(value, new Set(), withStack);
      if (cleaned !== undefined) out[key] = cleaned;
    } catch {
      out[key] = UNSERIALISABLE;
    }
  }
  return out;
};
