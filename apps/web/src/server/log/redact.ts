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
 * Every URL password hidden (`scheme://user:***@host`). After a `://`, the user name runs to the
 * first `:` or `/` (an unencoded `@` in it, as Azure's `admin@server`, stays part of it); from that
 * `:`, the password runs to the last `@` before the next `://` that follows its first `@`, so
 * spaces, `@` and `://` in it are hidden too. At worst a little more than the password is hidden (a
 * port, when an `@` comes later in the message). A loop, not a regex, reading each character a
 * bounded number of times (docs/knowledge/codeql-regex.md). Not caught: `user:pw@host` with no
 * scheme, and a password in a query string.
 */
const redactUrlPasswords = (value: string): string => {
  const finalAt = value.lastIndexOf("@");
  let out = "";
  let from = 0;
  for (let at = value.indexOf("://"); at !== -1; at = value.indexOf("://", from)) {
    let end = at + 3;
    while (end < value.length && value.charAt(end) !== ":" && value.charAt(end) !== "/") end++;
    // No `@` after the `:`: no password, here or in any later URL.
    if (value.charAt(end) !== ":" || finalAt < end) {
      out += value.slice(from, end);
      from = end;
      if (finalAt < end) break;
      continue;
    }
    const firstAt = value.indexOf("@", end);
    const next = value.indexOf("://", firstAt);
    const lastAt = value.lastIndexOf("@", next === -1 ? value.length : next);
    out += `${value.slice(from, end)}:***@`;
    from = lastAt + 1;
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
const cleanKey = (key: string): string => {
  // Redacted first, then cut: a cut must never leave part of a token or a password.
  const clean = redactString(key);
  return clean.length > MAX_KEY ? `${clean.slice(0, MAX_KEY)}…` : clean;
};

/**
 * What one line may hold, however its values are shaped: a value reached many ways (shared, not a
 * cycle) is written each time, so depth and width caps alone can multiply into millions.
 */
type Budget = { values: number; chars: number };
export const MAX_VALUES = 1000;
export const MAX_CHARS = 50_000;
const MAX_KEY = 200;
export const TOO_BIG = "[too big]";

/** Spends one value and `chars` characters; false once the line's budget is spent. */
const spend = (budget: Budget, chars: number): boolean => {
  budget.values -= 1;
  budget.chars -= chars;
  return budget.values >= 0 && budget.chars >= 0;
};

const clean = (
  value: unknown,
  seen: Set<object>,
  depth: number,
  budget: Budget,
  withStack: boolean,
): unknown => {
  if (value === null || typeof value === "boolean") return spend(budget, 0) ? value : TOO_BIG;
  if (typeof value === "number")
    return spend(budget, 0) ? (Number.isFinite(value) ? value : String(value)) : TOO_BIG;
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol")
    return undefined;
  if (typeof value === "bigint") throw new Unserialisable();
  if (typeof value === "string" || value instanceof String) {
    // Boxed strings whole, so redaction sees the secret they hold.
    const text = redactString(String(value.valueOf()));
    return spend(budget, text.length) ? text : TOO_BIG;
  }
  if (!spend(budget, 0)) return TOO_BIG;
  if (value instanceof Error) return errorFields(value, withStack);
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  // Bytes: never their content.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return `[${value.byteLength} bytes]`;
  if (seen.has(value)) throw new Unserialisable();
  if (depth >= MAX_DEPTH) return TOO_DEEP;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      for (const item of value.slice(0, MAX_ITEMS)) {
        if (budget.values <= 0) break;
        items.push(clean(item, seen, depth + 1, budget, withStack) ?? null);
      }
      return value.length > items.length
        ? [...items, `[${value.length - items.length} more]`]
        : items;
    }
    const out: Record<string, unknown> = {};
    const keys = Object.keys(value);
    let written = 0;
    for (const key of keys.slice(0, MAX_ITEMS)) {
      if (budget.values <= 0) break;
      written++;
      const name = cleanKey(key);
      budget.chars -= name.length;
      if (isSecretKey(key)) out[name] = REDACTED;
      else {
        const item = (value as Record<string, unknown>)[key];
        const cleaned = clean(item, seen, depth + 1, budget, withStack);
        if (cleaned !== undefined) out[name] = cleaned;
      }
    }
    if (keys.length > written) out["[more]"] = keys.length - written;
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
  const budget: Budget = { values: MAX_VALUES, chars: MAX_CHARS };
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
        key === "err"
          ? errorFields(value, withStack)
          : clean(value, new Set(), 0, budget, withStack);
      if (cleaned !== undefined) out[name] = cleaned;
    } catch {
      out[name] = UNSERIALISABLE;
    }
  }
  if (keys.length > MAX_ITEMS) out["[more]"] = keys.length - MAX_ITEMS;
  return out;
};
