import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fchmodSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { parseEnv } from "node:util";

/** Keys setup writes. Other lines in .env are kept as they are. */
export type SetupEnv = {
  DATABASE_URL: string;
  AUTH_SECRET: string;
  STORAGE_PATH: string;
  PUBLIC_URL: string;
};

/**
 * Keys kept when they already have a value. A new AUTH_SECRET would end every session, so setup
 * never replaces one.
 */
const KEEP_IF_SET = new Set(["AUTH_SECRET"]);

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const SAFE_UNQUOTED = /^[A-Za-z0-9_\-.:/@%+=,~]*$/;

/**
 * Formats a value so Node's .env parser (util.parseEnv, process.loadEnvFile) reads it back exactly.
 * That parser has no escape for a quote inside quotes, and treats `#` as a comment even without a
 * space before it, so the quoting style is chosen from what the value contains.
 */
export const formatEnvValue = (value: string): string => {
  if (/[\r\n\u2028\u2029]/.test(value)) throw new Error("A .env value can't contain a line break.");
  if (SAFE_UNQUOTED.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  // Double quotes expand \n, so they're only safe without backslashes.
  if (!value.includes('"') && !value.includes("\\")) return `"${value}"`;
  if (!value.includes("`")) return `\`${value}\``;
  throw new Error(
    "This value contains every kind of quote, so it can't be written to .env safely.",
  );
};

/** Reads .env into key/value pairs, the way the app will read it. A missing file is empty. */
export type EnvValues = Record<string, string | undefined>;

export const readEnvFile = (path: string): EnvValues => {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
};

/**
 * The settings file can't be merged so that it reads back as intended: a key's line sits inside
 * another key's multi-line value, say. Nothing is written; the file is for a person to edit.
 */
export class EnvMergeError extends Error {
  constructor(readonly key: string) {
    super(
      `The settings file can't be updated safely around ${key} (a multi-line value?). Edit it by hand.`,
    );
    this.name = "EnvMergeError";
  }
}

/**
 * Returns `existing` with `updates` applied: known keys are replaced in place, new ones are
 * appended, and every other line (comments, blank lines, other keys) is kept. A key in KEEP_IF_SET
 * that already has a value isn't replaced, unless `replaceKept` says so (`rotate-secret`, 098).
 * The result is read back before it's returned: each updated key must read as its new value and
 * every other key as before, or it throws EnvMergeError.
 */
export const mergeEnv = (
  existing: string,
  updates: Partial<SetupEnv>,
  options: { replaceKept?: boolean } = {},
): string => {
  const current = parseEnv(existing);
  const pending = new Map(
    Object.entries(updates).filter(
      ([key, value]) =>
        value !== undefined && (options.replaceKept || !(KEEP_IF_SET.has(key) && current[key])),
    ) as [string, string][],
  );

  // Each line keeps its own ending (LF, CRLF, or none on the last line); appended lines take the
  // file's first ending, LF in a new file.
  const lines = existing === "" ? [] : existing.split(/(?<=\n)/);
  const eol = /\r?\n/.exec(existing)?.[0] ?? "\n";
  const replacing = new Set(pending.keys());
  const written = new Set<string>();
  let result = "";
  for (const line of lines) {
    const body = line.replace(/\r?\n$/, "");
    const ending = line.slice(body.length);
    const key = LINE.exec(body)?.[1];
    if (!key || !replacing.has(key)) result += line;
    // The first line with the key gets the new value; later ones would win when the file is read
    // (the last value counts), so they go.
    else if (!written.has(key)) {
      result += `${key}=${formatEnvValue(pending.get(key) as string)}${ending}`;
      written.add(key);
    }
  }
  for (const [key, value] of pending) {
    if (written.has(key)) continue;
    if (result !== "" && !result.endsWith("\n")) result += eol;
    result += `${key}=${formatEnvValue(value)}${eol}`;
  }

  const after = parseEnv(result);
  for (const key of new Set([...Object.keys(current), ...Object.keys(after)])) {
    const expected = replacing.has(key) ? pending.get(key) : current[key];
    if (after[key] !== expected) throw new EnvMergeError(key);
  }
  return result;
};

/**
 * The folder can't take a new file: not ours (EACCES, EPERM), or read-only to us, as systemd's
 * ProtectSystem makes /etc for the service, which may write only the file itself (EROFS).
 */
export const cannotWriteFolder = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "EACCES" || error.code === "EPERM" || error.code === "EROFS");

/**
 * Writes .env readable only by its owner (0600), through a temporary file and a rename, so a crash
 * never leaves half a file. In a folder it may not write but with a file it may (the service's
 * /etc/rmk-server is root's, its settings file the server's: 083), it rewrites the file in place.
 */
/**
 * Rewriting the file in place failed partway, maybe: unlike a write through a temporary file, the
 * file may now be incomplete. Keeps the original error's code, so callers that look at it still do.
 */
export class InPlaceWriteError extends Error {
  readonly code: string | undefined;
  /**
   * True when the content was written in full and only setting the mode failed. A failed close
   * isn't: it can report a write the disk didn't finish (NFS, quotas).
   */
  readonly complete: boolean;
  constructor(cause: unknown, complete = false) {
    const code = (cause as NodeJS.ErrnoException).code;
    super(`Rewriting the settings file in place failed (${code ?? "an error"}).`, { cause });
    this.name = "InPlaceWriteError";
    this.code = code;
    this.complete = complete;
  }
}

/**
 * Rewrites the file itself. Failing to open it changes nothing and throws the plain error; once
 * it's open (and emptied), a failure throws InPlaceWriteError.
 */
const writeInPlace = (path: string, content: string, mode?: number) => {
  const fd = openSync(path, "w");
  // From here on the file was emptied: any failure, closing it included, may leave it incomplete.
  let failure: unknown;
  let complete = false;
  try {
    writeFileSync(fd, content);
    complete = true;
    if (mode !== undefined) fchmodSync(fd, mode);
  } catch (error) {
    failure = error;
  }
  try {
    closeSync(fd);
  } catch (error) {
    failure ??= error;
    complete = false;
  }
  if (failure !== undefined) throw new InPlaceWriteError(failure, complete);
};

/** Removes a file if it's there; a failure here never hides the error being handled. */
const removeQuietly = (path: string) => {
  try {
    rmSync(path, { force: true });
  } catch {
    // Not a file (a folder of that name), or not ours: the error being handled is the one to show.
  }
};

export const writeEnvFile = (path: string, content: string): void => {
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, content, { mode: 0o600 });
  } catch (error) {
    // A write can fail after creating the file (a full disk): never leave part of it behind.
    removeQuietly(temporary);
    if (!cannotWriteFolder(error) || !existsSync(path)) throw error;
    writeInPlace(path, content, 0o600);
    return;
  }
  try {
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
  } catch (error) {
    // It holds every setting, the secrets included: never leave it behind.
    removeQuietly(temporary);
    throw error;
  }
};

/** Merges `updates` into the .env at `path` (created if missing) and returns the values now in it. */
export const updateEnvFile = (path: string, updates: Partial<SetupEnv>): EnvValues => {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const content = mergeEnv(existing, updates);
  writeEnvFile(path, content);
  return parseEnv(content);
};

/** A new AUTH_SECRET: 32 random bytes, base64. */
export const generateAuthSecret = (): string => {
  return randomBytes(32).toString("base64");
};

/** Secrets shorter than 32 characters get a warning in setup, but are kept. */
export const isWeakSecret = (secret: string): boolean => {
  return secret.length < 32;
};

/**
 * A settings file both readers split into the same lines and keys: empty lines, `#` comments at the
 * start of a line, and `KEY=value` or `export KEY=value` with nothing around them: the value right
 * after `=`, unquoted printable ASCII (no quotes, `#` or edge spaces) or quoted on one line without
 * a backslash before the closing quote (none at all in double quotes), then optionally ` # comment`.
 * Lines end in LF or CRLF. Next.js's loader (dotenv, for a clone) and Node's parseEnv (the server's
 * reader) differ on what this leaves out: multi-line values, `KEY: value`, a newline before `=`,
 * escapes, edge whitespace, a carriage return or a Unicode line separator inside a line. One
 * difference remains, and isn't about lines: Next.js expands `$NAME` in values. Returns the first
 * line that isn't plain (1-based), or null. `rotate-secret` (098) only rewrites a plain file.
 */
const QUOTED =
  /'(?:[^'\r\u2028\u2029]*[^'\\\r\u2028\u2029])?'|"[^"\\\r\u2028\u2029]*"|`(?:[^`\r\u2028\u2029]*[^`\\\r\u2028\u2029])?`/
    .source;
/**
 * Printable ASCII, no leading or trailing space, not starting with a quote, no `#`. The ranges are
 * split at the digits and capitals so CodeQL doesn't read them as a typo (js/overly-large-range).
 */
const UNQUOTED = /[!$-&(-/0-9:-@A-Z[-_a-~](?:[ !$-&'-/0-9:-@A-Z[-_a-~]*[!$-&'-/0-9:-@A-Z[-_a-~])?/
  .source;
const PLAIN_LINE = new RegExp(
  // `export KEY=` with nothing after it is read as the key `export KEY` by some Node versions.
  `^(?:|#[^\\r\\u2028\\u2029]*|(?:export [A-Za-z_][A-Za-z0-9_]*=(?:${QUOTED}|${UNQUOTED})|[A-Za-z_][A-Za-z0-9_]*=(?:${QUOTED}|${UNQUOTED})?)(?: +#[^\\r\\u2028\\u2029]*)?)$`,
);

export const firstUnplainLine = (content: string): number | null => {
  const lines = content.replace(/\r?\n$/, "").split(/\r?\n/);
  const index = lines.findIndex((line) => !PLAIN_LINE.test(line));
  return index === -1 ? null : index + 1;
};
