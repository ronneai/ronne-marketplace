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

/**
 * Every URL password hidden as `redactDatabaseUrl` does (`scheme://user:***@host`): after a `://`,
 * a user name with no `:`, `/` or `@` in it, then a `:`, and the password runs to the last `@`
 * before the next `://`, spaces included. At worst a little more than the password is hidden. A
 * loop, not a regex, and each stretch between two `://` is read once, so a long message costs one
 * pass (docs/knowledge/codeql-regex.md). Not caught, as in `redactDatabaseUrl`: `user:pw@host`
 * with no scheme, and a password in a query string.
 */
const redactUrlPasswords = (value: string): string => {
  let out = "";
  let from = 0;
  for (let at = value.indexOf("://"); at !== -1; at = value.indexOf("://", from)) {
    let end = at + 3;
    while (end < value.length && !":/@".includes(value.charAt(end))) end++;
    if (value.charAt(end) === ":") {
      const next = value.indexOf("://", end);
      const stop = next === -1 ? value.length : next;
      let lastAt = -1;
      for (let i = end + 1; i < stop; i++) if (value.charAt(i) === "@") lastAt = i;
      if (lastAt !== -1) {
        out += `${value.slice(from, end)}:***@`;
        from = lastAt + 1;
        continue;
      }
    }
    // No password here, and no `://` before `end`: its `:` would have stopped the scan.
    out += value.slice(from, end);
    from = end;
  }
  return out + value.slice(from);
};

/** A string with every access token and URL password taken out, cut to MAX_STRING characters. */
export const redactString = (value: string): string => {
  const clean = redactUrlPasswords(value.replace(ACCESS_TOKEN, "rmk_[redacted]"));
  return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
};

/** How much of a value a line holds: deeper levels, more items or more keys become a marker. */
export const MAX_DEPTH = 8;
export const MAX_ITEMS = 100;
const TOO_DEEP = "[too deep]";

class Unserialisable extends Error {}

/**
 * An error as a line holds it: `{ name, message, code }`, with the stack only when asked for (lines
 * at `error`). A thrown value that isn't an Error is logged as its type only: it could be anything.
 * Its other properties (a driver's `config`, `cause`) aren't written: they could hold anything.
 */
export const errorFields = (error: unknown, withStack: boolean): Record<string, unknown> => {
  if (!(error instanceof Error)) return { type: error === null ? "null" : typeof error };
  const code = (error as { code?: unknown }).code;
  return {
    name: redactString(String(error.name)),
    message: redactString(String(error.message)),
    ...(typeof code === "string" ? { code: redactString(code) } : {}),
    ...(typeof code === "number" ? { code } : {}),
    ...(withStack && error.stack ? { stack: redactString(String(error.stack)) } : {}),
  };
};

/** A key as a line holds it: cleaned like a value, and short. */
const cleanKey = (key: string): string => redactString(key.length > 200 ? key.slice(0, 200) : key);

const clean = (value: unknown, seen: Set<object>, depth: number, withStack: boolean): unknown => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return redactString(value);
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol")
    return undefined;
  if (typeof value === "bigint") throw new Unserialisable();
  if (value instanceof Error) return errorFields(value, withStack);
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  // Boxed strings and bytes: whole, so redaction sees the secret they hold, or not at all.
  if (value instanceof String) return redactString(value.valueOf());
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return `[${value.byteLength} bytes]`;
  if (seen.has(value)) throw new Unserialisable();
  if (depth >= MAX_DEPTH) return TOO_DEEP;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ITEMS)
        .map((item) => clean(item, seen, depth + 1, withStack) ?? null);
      return value.length > MAX_ITEMS ? [...items, `[${value.length - MAX_ITEMS} more]`] : items;
    }
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value);
    for (const key of keys.slice(0, MAX_ITEMS)) {
      const name = cleanKey(key);
      if (isSecretKey(key)) out[name] = REDACTED;
      else {
        const cleaned = clean((value as Record<string, unknown>)[key], seen, depth + 1, withStack);
        if (cleaned !== undefined) out[name] = cleaned;
      }
    }
    if (keys.length > MAX_ITEMS) out["[more]"] = keys.length - MAX_ITEMS;
    return out;
  } finally {
    seen.delete(value);
  }
};

/**
 * The fields of a line as JSON can hold them: each secret key redacted at any depth, keys and
 * strings cleaned, errors as `errorFields`, sizes capped. A field that can't be written (a cycle, a
 * BigInt, a getter that throws) is UNSERIALISABLE on its own; the others are kept. Never throws.
 */
export const cleanFields = (fields: unknown, withStack: boolean): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  let keys: string[];
  try {
    keys = fields !== null && typeof fields === "object" ? Object.keys(fields) : [];
  } catch {
    return { fields: UNSERIALISABLE };
  }
  for (const key of keys.slice(0, MAX_ITEMS)) {
    const name = cleanKey(key);
    if (isSecretKey(key)) {
      out[name] = REDACTED;
      continue;
    }
    try {
      const value = (fields as Record<string, unknown>)[key];
      // `err` is what was thrown: an Error as errorFields, anything else as its type only.
      const cleaned =
        key === "err" ? errorFields(value, withStack) : clean(value, new Set(), 0, withStack);
      if (cleaned !== undefined) out[name] = cleaned;
    } catch {
      out[name] = UNSERIALISABLE;
    }
  }
  if (keys.length > MAX_ITEMS) out["[more]"] = keys.length - MAX_ITEMS;
  return out;
};
