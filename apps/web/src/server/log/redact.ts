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

/**
 * An access token (feature 009): `rmk_` and 43 base64url characters. The whole run of such
 * characters is taken, so a token right after another `rmk_` run can't be left half written.
 */
const ACCESS_TOKEN = /rmk_[A-Za-z0-9_-]{43,}/g;

/**
 * Every URL password hidden, by `redactDatabaseUrl`'s own rule: after a `://`, a user name up to the
 * first `:` or `/` (an `@` in it, as Azure's `admin@server`, stays part of it); from that `:`, the
 * password runs to the last `@` in the whole string, so no `@`, `://` or space in it can end it
 * early. With two URLs in one message, more than the first password is hidden; never less. A loop,
 * not a regex, reading each character a bounded number of times (docs/knowledge/codeql-regex.md).
 * Not caught: `user:pw@host` with no scheme, and a password in a query string.
 */
const redactUrlPasswords = (value: string): string => {
  const finalAt = value.lastIndexOf("@");
  let from = 0;
  for (let at = value.indexOf("://"); at !== -1; at = value.indexOf("://", from)) {
    let end = at + 3;
    while (end < value.length && value.charAt(end) !== ":" && value.charAt(end) !== "/") end++;
    // No `@` after this point: no password here or in any later URL.
    if (finalAt < end) break;
    if (value.charAt(end) === ":") return `${value.slice(0, end)}:***@${value.slice(finalAt + 1)}`;
    from = end;
  }
  return value;
};

/** A string with every access token and URL password taken out, cut to MAX_STRING characters. */
export const redactString = (value: string): string => {
  const clean = redactUrlPasswords(value.replace(ACCESS_TOKEN, "rmk_[redacted]"));
  return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
};

/** How much of a value a line holds: deeper levels, more items or more keys become a marker. */
export const MAX_DEPTH = 8;
export const MAX_ITEMS = 100;
const MAX_KEY = 200;
const TOO_DEEP = "[too deep]";
export const TOO_BIG = "[too big]";

/**
 * One line's budget and memory. A value reached many ways (shared, not a cycle) is written each
 * time, so caps on depth and width alone can multiply into millions: every value visited spends
 * one of `values`, every character written spends one of `chars`, for the bindings and the fields
 * together. The work on a string, an error or an object's keys is done once per line, however often
 * it's reached: a 10 MB message shared a thousand times is redacted once.
 */
export type Line = {
  values: number;
  chars: number;
  strings: Map<string, string>;
  errors: Map<object, Record<string, unknown>>;
  keys: Map<object, { first: string[]; total: number }>;
};
export const MAX_VALUES = 1000;
export const MAX_CHARS = 50_000;

export const newLine = (): Line => ({
  values: MAX_VALUES,
  chars: MAX_CHARS,
  strings: new Map(),
  errors: new Map(),
  keys: new Map(),
});

/** `redactString`, once per string per line. */
const redactOnce = (line: Line, value: string): string => {
  let clean = line.strings.get(value);
  if (clean === undefined) {
    clean = redactString(value);
    line.strings.set(value, clean);
  }
  return clean;
};

/** A key as a line holds it: redacted, then cut (a cut must never leave part of a secret). */
const cleanKey = (line: Line, key: string): string => {
  const clean = redactOnce(line, key);
  const cut = clean.length > MAX_KEY ? `${clean.slice(0, MAX_KEY)}…` : clean;
  line.chars -= cut.length;
  return cut;
};

/** The first MAX_ITEMS own keys of an object and how many it has, read once per line. */
const keysOf = (line: Line, value: object) => {
  let keys = line.keys.get(value);
  if (!keys) {
    const all = Object.keys(value);
    keys = { first: all.slice(0, MAX_ITEMS), total: all.length };
    line.keys.set(value, keys);
  }
  return keys;
};

class Unserialisable extends Error {}

/**
 * An error as a line holds it: `{ name, message, code }`, with the stack only when asked for (lines
 * at `error`). A thrown value that isn't an Error is logged as its type only: it could be anything.
 * Its other properties (a driver's `config`, `cause`) aren't written: they could hold anything.
 */
export const errorFields = (
  error: unknown,
  withStack: boolean,
  line: Line = newLine(),
): Record<string, unknown> => {
  if (!(error instanceof Error)) return { type: error === null ? "null" : typeof error };
  const known = line.errors.get(error);
  if (known) return known;
  const code = (error as { code?: unknown }).code;
  const fields = {
    name: redactOnce(line, String(error.name)),
    message: redactOnce(line, String(error.message)),
    ...(typeof code === "string" ? { code: redactOnce(line, code) } : {}),
    ...(typeof code === "number" ? { code } : {}),
    ...(withStack && error.stack ? { stack: redactOnce(line, String(error.stack)) } : {}),
  };
  line.errors.set(error, fields);
  return fields;
};

/** Spends one value and `chars` characters of the line; false once it's spent. */
const spend = (line: Line, chars: number): boolean => {
  line.values -= 1;
  line.chars -= chars;
  return line.values >= 0 && line.chars >= 0;
};

const outOfBudget = (line: Line) => line.values <= 0 || line.chars <= 0;

const clean = (
  value: unknown,
  seen: Set<object>,
  depth: number,
  line: Line,
  withStack: boolean,
): unknown => {
  // Every value visited spends, `undefined` and holes too.
  if (outOfBudget(line)) return TOO_BIG;
  if (value === null || typeof value === "boolean") return spend(line, 0) ? value : TOO_BIG;
  if (typeof value === "number")
    return spend(line, 0) ? (Number.isFinite(value) ? value : String(value)) : TOO_BIG;
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    spend(line, 0);
    return undefined;
  }
  if (typeof value === "bigint") throw new Unserialisable();
  if (typeof value === "string" || value instanceof String) {
    // Boxed strings whole, so redaction sees the secret they hold.
    const text = redactOnce(line, String(value.valueOf()));
    return spend(line, text.length) ? text : TOO_BIG;
  }
  if (value instanceof Error) {
    const fields = errorFields(value, withStack, line);
    const chars = Object.values(fields).reduce<number>(
      (sum, field) => sum + (typeof field === "string" ? field.length : 0),
      0,
    );
    return spend(line, chars) ? fields : TOO_BIG;
  }
  if (!spend(line, 0)) return TOO_BIG;
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
      const length = Math.min(value.length, MAX_ITEMS);
      for (let i = 0; i < length && !outOfBudget(line); i++)
        items.push(clean(value[i], seen, depth + 1, line, withStack) ?? null);
      return value.length > items.length
        ? [...items, `[${value.length - items.length} more]`]
        : items;
    }
    const out: Record<string, unknown> = {};
    const { first, total } = keysOf(line, value);
    let written = 0;
    for (const key of first) {
      if (outOfBudget(line)) break;
      written++;
      const name = cleanKey(line, key);
      if (isSecretKey(key)) out[name] = REDACTED;
      else {
        const item = (value as Record<string, unknown>)[key];
        const cleaned = clean(item, seen, depth + 1, line, withStack);
        if (cleaned !== undefined) out[name] = cleaned;
      }
    }
    if (total > written) out["[more]"] = total - written;
    return out;
  } finally {
    seen.delete(value);
  }
};

/**
 * The fields of a line as JSON can hold them: each secret key redacted at any depth, keys and
 * strings cleaned, errors as `errorFields`, sizes capped, the whole within the line's budget
 * (shared with the line's other fields: pass the same `line`). A field that can't be written (a
 * cycle, a BigInt, a getter that throws) is UNSERIALISABLE on its own; the others are kept. Never
 * throws.
 */
export const cleanFields = (
  fields: unknown,
  withStack: boolean,
  line: Line = newLine(),
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  let keys: { first: string[]; total: number };
  try {
    keys =
      fields !== null && typeof fields === "object"
        ? keysOf(line, fields)
        : { first: [], total: 0 };
  } catch {
    return { fields: UNSERIALISABLE };
  }
  let written = 0;
  for (const key of keys.first) {
    if (outOfBudget(line)) break;
    written++;
    const name = cleanKey(line, key);
    if (isSecretKey(key)) {
      out[name] = REDACTED;
      continue;
    }
    try {
      const value = (fields as Record<string, unknown>)[key];
      // `err` is what was thrown: an Error as errorFields, anything else as its type only.
      const cleaned =
        key === "err"
          ? errorFields(value, withStack, line)
          : clean(value, new Set(), 0, line, withStack);
      if (cleaned !== undefined) out[name] = cleaned;
    } catch {
      out[name] = UNSERIALISABLE;
    }
  }
  if (keys.total > written) out["[more]"] = keys.total - written;
  return out;
};
