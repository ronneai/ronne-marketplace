import { MESSAGE_FOR_PEOPLE } from "./message-for-people";

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

/** The longest ending that can name a secret: "authorizations". */
const SECRET_TAIL = Math.max(...SECRET_KEYS.map((secret) => secret.length)) + 1;

/** At most this many characters are read from a key's end. */
const SECRET_READ = 256;

/**
 * Whether a key names a secret. Only its end is read (its last letters, `_` and `-` left out), at
 * most SECRET_READ characters, so a key of any length costs little. A key whose end is too long to
 * read that way (a long run of `_` or `-`) counts as a secret: more is hidden, never less.
 */
export const isSecretKey = (key: string): boolean => {
  let tail = "";
  let i = key.length - 1;
  for (; i >= 0 && tail.length < SECRET_TAIL && key.length - i <= SECRET_READ; i--) {
    const char = key.charAt(i);
    if (char !== "_" && char !== "-") tail = char.toLowerCase() + tail;
  }
  if (i >= 0 && tail.length < SECRET_TAIL) return true;
  return SECRET_KEYS.some((secret) => tail.endsWith(secret) || tail.endsWith(`${secret}s`));
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

/**
 * Folders whose contents' names aren't logged (feature 100, owner's decision): the storage's, whose
 * paths are `scope/name/version.tgz`, so a storage error would name an item a private workspace
 * hides (093). A storage adapter registers its root as it's made.
 */
const hiddenRoots = new Set<string>();

export const hidePathsUnder = (root: string): void => {
  // Trailing slashes off, with a loop (docs/knowledge/codeql-regex.md).
  let end = root.length;
  while (end > 0 && (root.charAt(end - 1) === "/" || root.charAt(end - 1) === "\\")) end--;
  if (end > 0) hiddenRoots.add(root.slice(0, end));
};

/** A path's end: a space, a quote or what closes it in a message. */
const PATH_END = new Set([" ", "\t", "\n", "'", '"', "`", ",", ";", ")", "]", "}"]);

/** Every path under `root` written as `root/[path]`. A loop: one pass over the text. */
const hideUnder = (value: string, root: string): string => {
  let out = "";
  let from = 0;
  for (let at = value.indexOf(root); at !== -1; at = value.indexOf(root, from)) {
    const start = at + root.length;
    const next = value.charAt(start);
    if (next !== "/" && next !== "\\") {
      out += value.slice(from, start);
      from = start;
      continue;
    }
    let end = start + 1;
    while (end < value.length && !PATH_END.has(value.charAt(end))) end++;
    out += `${value.slice(from, start)}${next}[path]`;
    from = end;
  }
  return out + value.slice(from);
};

// An address's characters, in any script (the app accepts `josé@example.com`): before the `@`,
// anything but spaces, another `@`, what brackets or separates an address, and `*` (a hidden
// password's `***`); `'` is read, as in `o'brien@…`, then trimmed from the front (a quoted
// address). After it, letters, digits, marks, dots and hyphens. `\p{Cs}` keeps a letter outside the BMP whole: charAt reads its two halves.
const LOCAL = /^[^\s@"()<>[\]{},;:\\/`*]$/u;
// After it, anything but spaces, another `@`, quotes and what brackets or separates an address (`/`
// too, which ends pnpm's paths): IDNA keeps symbols and punctuation in a domain (`col·legi.cat`,
// `i❤.ws`, `ⓔxample.com`), maps `。`, `．` and `｡` to `.`, and drops format characters (a soft
// hyphen, a zero-width space). The last label then decides (TOP_LABEL); a domain holding `_` must
// start with a letter: pnpm's `react-dom@19.2.0_react@19.2.0` paths aren't addresses.
// (`\s` counts U+FEFF as a space; IDNA drops it as a format character, so it stays in.)
const DOMAIN = /^(?:\uFEFF|[^\s@"'()<>[\]{},;:\\/`*])$/u;
const DOTS = /[.\u3002\uFF0E\uFF61]/gu;
/** A domain as IDNA reads it: its dots as `.`, its format characters gone. */
const asDomain = (value: string) => value.replace(DOTS, ".").replace(/\p{Cf}/gu, "");
// A domain's last label: letters and digits in any script with at least one letter (`.de`, `.рф`,
// `.x`, `.c0m`), or its ASCII form (`xn--p1ai`). All digits isn't one: `next@16.4.0` is a version.
const TOP_LABEL = /^(?:(?=[\p{L}\p{N}\p{M}]*\p{L})[\p{L}\p{N}\p{M}]+|xn--[a-z0-9-]+)$/iu;
// A domain that is an IPv4 address (`bob@192.0.2.1`), and an address literal (`bob@[192.0.2.1]`).
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const LITERAL = /^\[(?:IPv6:)?[0-9A-Fa-f:.]{1,45}\]/;

// Where a domain may stop short of its run (`ana@i❤.ws?v=1.2`): at any character that isn't a letter,
// digit, mark or format character. At most a hostname's length (253, DNS) is tried, so it stays
// linear.
const WORD = /^[\p{L}\p{N}\p{M}\p{Cf}]$/u;
const MAX_DOMAIN = 253;

/**
 * Where the domain after `value[at]` ends when it's an address's, reading up to `end`, or -1: no
 * trailing dot or hyphen (an address ending a sentence), a last label that runs on past its letters
 * and digits (`example.com-acme`) cut there, then a last label with a letter or an IPv4 address.
 */
const domainEnd = (value: string, at: number, limit: number): number => {
  let end = limit;
  while (end > at + 1 && ".-\u3002\uFF0E\uFF61".includes(value.charAt(end - 1))) end--;
  let dot = end - 1;
  while (dot > at && !".\u3002\uFF0E\uFF61".includes(value.charAt(dot))) dot--;
  if (dot > at && !TOP_LABEL.test(asDomain(value.slice(dot + 1, end)))) {
    // Its letters and digits, or its ASCII form (`xn--p1ai?x=1`).
    const run =
      /^(?:xn--[a-z0-9-]*[a-z0-9]|[\p{L}\p{N}\p{M}\p{Cf}]*)/iu.exec(
        value.slice(dot + 1, end),
      )?.[0] ?? "";
    if (TOP_LABEL.test(asDomain(run))) end = dot + 1 + run.length;
  }
  const domain = asDomain(value.slice(at + 1, end));
  const last = domain.slice(domain.lastIndexOf(".") + 1);
  const named = TOP_LABEL.test(last) && (!domain.includes("_") || /^\p{L}/u.test(domain));
  return domain.includes(".") && (named || IPV4.test(domain)) ? end : -1;
};

/**
 * Every email address written as `[email]` (feature 100: a line holds no email; a database's
 * duplicate-key error quotes the value it refused). A loop around each `@`, reading each character a
 * bounded number of times: the address's characters before it, and a domain after it whose last
 * label is letters (so `next@16.4.0` in a path and `@scope/name` aren't addresses). Neither side reads
past another `@`, so each character is read at most twice.
 */
const hideEmails = (value: string): string => {
  let out = "";
  let from = 0;
  for (let at = value.indexOf("@"); at !== -1; at = value.indexOf("@", at + 1)) {
    if (at < from) continue;
    let start = at;
    while (start > from && LOCAL.test(value.charAt(start - 1))) start--;
    while (start < at && value.charAt(start) === "'") start++;
    // A quoted local part (`"ana"@example.com`, `"a@b"@example.com`): back to its opening quote,
    // at most 64 characters away (RFC 5321's local-part limit). Else, from the quote back as an
    // unquoted local part: `ana"@example.com` in a long quotation.
    if (start === at && value.charAt(at - 1) === '"') {
      const window = Math.max(from, at - 66);
      let open = at - 2;
      while (open >= window && value.charAt(open) !== '"') open--;
      if (open >= window) start = open;
      else {
        start = at - 1;
        while (start > from && LOCAL.test(value.charAt(start - 1))) start--;
        if (start === at - 1) start = at;
      }
    }
    if (start === at) continue;
    const literal = LITERAL.exec(value.slice(at + 1, at + 48))?.[0];
    if (literal) {
      out += `${value.slice(from, start)}[email]`;
      from = at + 1 + literal.length;
      continue;
    }
    let end = at + 1;
    while (end < value.length && DOMAIN.test(value.charAt(end))) end++;
    // The whole run, else its longest start that is a domain, cut where a character isn't a letter
    // or digit (`example.c0m?x=1`, `192.0.2.1?x`, `i❤.ws?v=1.2`, `x+y.com#v1.2`).
    let found = domainEnd(value, at, end);
    if (found === -1) {
      const last = Math.min(end - 1, at + 1 + MAX_DOMAIN);
      for (let cut = at + 2; cut <= last; cut++) {
        if (WORD.test(value.charAt(cut))) continue;
        const shorter = domainEnd(value, at, cut);
        if (shorter > found) found = shorter;
      }
    }
    if (found === -1) continue;
    out += `${value.slice(from, start)}[email]`;
    from = found;
  }
  return out + value.slice(from);
};

const hidePaths = (value: string): string => {
  let out = value;
  for (const root of hiddenRoots) out = hideUnder(out, root);
  return out;
};

/**
 * The value MySQL and MariaDB quote in a duplicate-key error (`Duplicate entry '<value>' for key`),
 * written `[value]`: it can be an email or an item's name (feature 100). PostgreSQL keeps the value
 * in the error's `detail`, which isn't written; SQLite names only the columns. Linear: each search
 * starts where the last one ended.
 */
const hideDuplicateValues = (value: string): string => {
  const OPEN = "Duplicate entry '";
  const CLOSE = "' for key";
  let out = "";
  let from = 0;
  for (let at = value.indexOf(OPEN); at !== -1; at = value.indexOf(OPEN, from)) {
    const close = value.indexOf(CLOSE, at + OPEN.length);
    if (close === -1) break;
    out += `${value.slice(from, at + OPEN.length)}[value]`;
    from = close;
  }
  return out + value.slice(from);
};

/**
 * A string with every access token, URL password, storage path, email and duplicate-key value taken
 * out, cut to MAX_STRING characters.
 */
export const redactString = (value: string): string => {
  // Duplicate-key values first: a URL earlier in the message hides up to its last `@`, which an
  // item's name (`@scope/name`) in the value would otherwise move past the value's opening quote.
  const clean = hideEmails(
    hidePaths(
      redactUrlPasswords(hideDuplicateValues(value.replace(ACCESS_TOKEN, "rmk_[redacted]"))),
    ),
  );
  return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
};

/** How much of a value a line holds: deeper levels, more items or more keys become a marker. */
export const MAX_DEPTH = 8;
export const MAX_ITEMS = 100;
const MAX_KEY = 200;
/** A string longer than this is never read: only its length is written. */
export const MAX_RAW = 65_536;
const TOO_DEEP = "[too deep]";
export const TOO_BIG = "[too big]";

/**
 * One line's budget. A value reached many ways (shared, not a cycle) is written each time, so caps
 * on depth and width alone can multiply into millions: every value visited spends one of `values`,
 * and every character of a string or key spends one of `chars` before it's read, for the bindings
 * and the fields together. So the work of a line is bounded whatever it's given, and so is what it
 * writes (the logger also caps the finished line, `MAX_LINE`). An error's fields and an object's
 * keys are read once per line, by identity.
 */
export type Line = {
  values: number;
  chars: number;
  errors: Map<object, Record<string, unknown>>;
  keys: Map<object, { first: string[]; secret: boolean[]; total: number }>;
};
export const MAX_VALUES = 1000;
export const MAX_CHARS = 50_000;

export const newLine = (): Line => ({
  values: MAX_VALUES,
  chars: MAX_CHARS,
  errors: new Map(),
  keys: new Map(),
});

/** Spends one value and `chars` characters of the line; false once it's spent. */
const spend = (line: Line, chars: number): boolean => {
  line.values -= 1;
  line.chars -= chars;
  return line.values >= 0 && line.chars >= 0;
};

const outOfBudget = (line: Line) => line.values <= 0 || line.chars <= 0;

/**
 * A string as a line holds it: charged by its length before it's read, then redacted. Too long to
 * read (over MAX_RAW) or past the budget, only a marker is written: never part of it, which could be
 * part of a secret.
 */
const cleanString = (line: Line, value: string): string => {
  if (value.length > MAX_RAW) {
    spend(line, 0);
    return `[${value.length} characters]`;
  }
  return spend(line, value.length) ? redactString(value) : TOO_BIG;
};

/** A message, a request ID: as `cleanString` writes a string, outside any budget. */
export const cleanText = (value: string): string =>
  value.length > MAX_RAW ? `[${value.length} characters]` : redactString(value);

/** A key as a line holds it: like a string, then cut (after redaction: never part of a secret). */
const cleanKey = (line: Line, key: string, index: number): string => {
  // Too long to read: only a marker, charged as the marker.
  const clean = key.length > MAX_RAW ? `[key ${index}]` : redactString(key);
  line.chars -= key.length > MAX_RAW ? clean.length : key.length;
  return clean.length > MAX_KEY ? `${clean.slice(0, MAX_KEY)}…` : clean;
};

/**
 * The first MAX_ITEMS own keys of an object, which of them name a secret, and how many it has: read
 * once per line, however often the object is reached.
 */
const keysOf = (line: Line, value: object) => {
  let keys = line.keys.get(value);
  if (!keys) {
    const all = Object.keys(value);
    const first = all.slice(0, MAX_ITEMS);
    keys = { first, secret: first.map(isSecretKey), total: all.length };
    line.keys.set(value, keys);
  }
  return keys;
};

// The built-in methods, so a Date or a Buffer can't answer with its own (an override on the value
// or a subclass could return a secret, or a string too big to hold).
const dateTime = Date.prototype.getTime;
const dateIso = Date.prototype.toISOString;
const getter = (proto: object, name: string) =>
  Object.getOwnPropertyDescriptor(proto, name)?.get as ((this: unknown) => unknown) | undefined;
const typedBytes = getter(Object.getPrototypeOf(Uint8Array.prototype), "byteLength");
const viewBytes = getter(DataView.prototype, "byteLength");
const bufferBytes = getter(ArrayBuffer.prototype, "byteLength");

const dateText = (value: Date): string => {
  const time = Reflect.apply(dateTime, value, []) as number;
  return Number.isNaN(time) ? "Invalid Date" : (Reflect.apply(dateIso, value, []) as string);
};

const bytesText = (value: ArrayBufferView | ArrayBuffer): string => {
  const read =
    value instanceof ArrayBuffer ? bufferBytes : value instanceof DataView ? viewBytes : typedBytes;
  let size: unknown;
  try {
    size = read ? Reflect.apply(read, value, []) : undefined;
  } catch {
    size = undefined;
  }
  return Number.isSafeInteger(size) ? `[${size} bytes]` : "[bytes]";
};

class Unserialisable extends Error {}

/**
 * An error as a line holds it: `{ name, message, code }`, with the stack only when asked for (lines
 * at `error`), each string as `cleanString` writes it. A thrown value that isn't an Error is logged
 * as its type only: it could be anything. Its other properties (a driver's `config`, `cause`) aren't
 * written: they could hold anything.
 */
export const errorFields = (
  error: unknown,
  withStack: boolean,
  line: Line = newLine(),
): Record<string, unknown> => {
  if (!(error instanceof Error)) return { type: error === null ? "null" : typeof error };
  const known = line.errors.get(error);
  if (known) {
    spend(line, JSON.stringify(known).length);
    return known;
  }
  const code = (error as { code?: unknown }).code;
  // A message for people (a domain's error) may name an item: it, and its copy in the stack's first
  // line, aren't written; the frames are.
  const forPeople = (error as { [MESSAGE_FOR_PEOPLE]?: unknown })[MESSAGE_FOR_PEOPLE] === true;
  // The stack's head is `<name>: <message>`; the message is cut off as a whole, so text in it
  // shaped like a frame (`\n    at …`) goes with it.
  const frames = (stack: string) => {
    const message = String(error.message);
    const at = message ? stack.indexOf(message) : -1;
    const rest =
      at === -1
        ? stack.slice(Math.max(0, stack.indexOf("\n    at ")))
        : stack.slice(at + message.length);
    return `${error.name}: [hidden]${rest}`;
  };
  const stack =
    withStack && error.stack && forPeople
      ? frames(error.stack)
      : withStack
        ? error.stack
        : undefined;
  const fields = {
    name: cleanString(line, String(error.name)),
    message: forPeople ? "[hidden]" : cleanString(line, String(error.message)),
    ...(typeof code === "string" ? { code: cleanString(line, code) } : {}),
    ...(typeof code === "number" ? { code } : {}),
    ...(stack ? { stack: cleanString(line, String(stack)) } : {}),
  };
  line.errors.set(error, fields);
  return fields;
};

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
  // Boxed strings whole, so redaction sees the secret they hold.
  if (typeof value === "string") return cleanString(line, value);
  if (value instanceof String) return cleanString(line, String.prototype.valueOf.call(value));
  if (value instanceof Error) return errorFields(value, withStack, line);
  if (!spend(line, 0)) return TOO_BIG;
  if (value instanceof Date) return dateText(value);
  // Bytes: never their content.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return bytesText(value);
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
    return cleanObject(value as Record<string, unknown>, line, (item) =>
      clean(item, seen, depth + 1, line, withStack),
    );
  } finally {
    seen.delete(value);
  }
};

/**
 * An object's first keys within the line's budget, secret ones redacted, the others' values as
 * `cleanValue` writes them; then `"[more]": N`. At the top (`markEach`), a value that can't be
 * written is UNSERIALISABLE on its own; deeper, the whole top field is.
 */
const cleanObject = (
  value: Record<string, unknown>,
  line: Line,
  cleanValue: (item: unknown, key: string) => unknown,
  markEach = false,
): Record<string, unknown> => {
  // No prototype: a `__proto__` key (from request JSON) is kept as a field, not taken as one.
  const out: Record<string, unknown> = Object.create(null);
  const { first, secret, total } = keysOf(line, value);
  let written = 0;
  for (const [index, key] of first.entries()) {
    if (outOfBudget(line)) break;
    const name = cleanKey(line, key, written);
    written++;
    if (secret[index]) {
      spend(line, REDACTED.length);
      out[name] = REDACTED;
      continue;
    }
    try {
      const cleaned = cleanValue(value[key], key);
      if (cleaned !== undefined) out[name] = cleaned;
    } catch (error) {
      if (!markEach) throw error;
      out[name] = UNSERIALISABLE;
    }
  }
  if (total > written) out["[more]"] = total - written;
  return out;
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
  if (fields === null || typeof fields !== "object") return {};
  try {
    return cleanObject(
      fields as Record<string, unknown>,
      line,
      (value, key) =>
        // `err` is what was thrown: an Error as errorFields, anything else as its type only.
        key === "err"
          ? errorFields(value, withStack, line)
          : clean(value, new Set(), 0, line, withStack),
      true,
    );
  } catch {
    return { fields: UNSERIALISABLE };
  }
};
