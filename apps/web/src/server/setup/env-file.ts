import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
  if (/[\r\n]/.test(value)) throw new Error("A .env value can't contain a line break.");
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
 * Returns `existing` with `updates` applied: known keys are replaced in place, new ones are
 * appended, and every other line (comments, blank lines, other keys) is kept. A key in KEEP_IF_SET
 * that already has a value isn't replaced.
 */
export const mergeEnv = (existing: string, updates: Partial<SetupEnv>): string => {
  const current = parseEnv(existing);
  const pending = new Map(
    Object.entries(updates).filter(
      ([key, value]) => value !== undefined && !(KEEP_IF_SET.has(key) && current[key]),
    ) as [string, string][],
  );

  const lines = existing === "" ? [] : existing.replace(/\n$/, "").split("\n");
  const merged = lines.map((line) => {
    const key = LINE.exec(line)?.[1];
    if (!key || !pending.has(key)) return line;
    const value = pending.get(key) as string;
    pending.delete(key);
    return `${key}=${formatEnvValue(value)}`;
  });
  for (const [key, value] of pending) merged.push(`${key}=${formatEnvValue(value)}`);
  return `${merged.join("\n")}\n`;
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
 * So it does on Windows whenever the file exists: a new file takes its folder's permissions, and
 * the service's own .env is the one file there its account may write (086).
 */
export const writeEnvFile = (
  path: string,
  content: string,
  platform: NodeJS.Platform = process.platform,
): void => {
  if (platform === "win32" && existsSync(path)) {
    writeFileSync(path, content);
    return;
  }
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, content, { mode: 0o600 });
  } catch (error) {
    if (!cannotWriteFolder(error) || !existsSync(path)) throw error;
    writeFileSync(path, content, { mode: 0o600 });
    chmodSync(path, 0o600);
    return;
  }
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
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
