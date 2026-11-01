import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * The one-time setup code (161): only whoever started the server can set it up. It's kept in the
 * data folder, shown in the server's log and by the install script, and asked for by every step of
 * the web setup. The terminal setup doesn't ask.
 */

/** Crockford's base32 alphabet: no I, L, O or U. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 128 bits, five per character. */
export const SETUP_CODE_LENGTH = 26;

const BITS = 128;

/** The file's name in the data folder. */
export const SETUP_CODE_FILE = "setup-code";

/**
 * Where the code is kept: the data folder, RONNE_DATA_DIR when it's set (the Docker volume, the npm
 * package's folder, or any start that names one, as `start.ts` and backups read it), else `./data`
 * next to the app.
 */
export const setupCodePath = (env: Record<string, string | undefined> = process.env): string =>
  env.RONNE_DATA_DIR ? join(env.RONNE_DATA_DIR, SETUP_CODE_FILE) : `./data/${SETUP_CODE_FILE}`;

/**
 * A new code: 128 random bits, as 26 characters of Crockford base32. 26 characters hold 130 bits,
 * so the first one carries only three and is 0 to 7.
 */
export const makeSetupCode = (): string => {
  let value = BigInt(`0x${randomBytes(BITS / 8).toString("hex")}`);
  let code = "";
  for (let index = 0; index < SETUP_CODE_LENGTH; index++) {
    code = ALPHABET[Number(value & 31n)] + code;
    value >>= 5n;
  }
  return code;
};

/** The code as shown to a person: groups of five, joined by dashes (`0KQ2M-…-X`). */
export const formatSetupCode = (code: string): string => code.match(/.{1,5}/g)?.join("-") ?? "";

/** Look-alikes Crockford decoding accepts: O for zero, I and L for one. */
const LOOK_ALIKES: Record<string, string> = { O: "0", I: "1", L: "1" };

const SEPARATORS = /[\s-]+/g;

/**
 * A typed code in its canonical form: any case, spaces and dashes ignored, look-alikes read as the
 * digits they stand for. Null when it can't be a code (wrong length, a character outside the
 * alphabet, or more than 128 bits).
 */
export const normaliseSetupCode = (typed: string): string | null => {
  const code = typed
    .replace(SEPARATORS, "")
    .toUpperCase()
    .replace(/[OIL]/g, (letter) => LOOK_ALIKES[letter] ?? letter);
  if (code.length !== SETUP_CODE_LENGTH) return null;
  for (const character of code) if (!ALPHABET.includes(character)) return null;
  // 26 characters hold 130 bits: a first character above 7 is more than a code can be.
  if (ALPHABET.indexOf(code[0] as string) > 7) return null;
  return code;
};

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/**
 * Whether a typed code is this server's, compared in constant time on their SHA-256, so neither the
 * time taken nor the length typed says anything about the code.
 */
export const checkSetupCode = (typed: string, stored: string): boolean => {
  const canonical = normaliseSetupCode(typed) ?? "";
  // Both digests are always compared, a malformed code included, so the time is the same.
  const same = timingSafeEqual(digest(canonical), digest(stored));
  return same && canonical !== "";
};

/** The code in the file, or null when there's no file or it doesn't hold a code. */
export const readSetupCode = (path: string): string | null => {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return normaliseSetupCode(content.trim());
};

const isCode = (error: unknown, ...codes: string[]): boolean =>
  error instanceof Error && "code" in error && codes.includes(String(error.code));

/** Removes a file if it's there; a failure here never hides the error being handled. */
const removeQuietly = (path: string) => {
  try {
    rmSync(path, { force: true });
  } catch {
    // Not ours, or a folder of that name: the error being handled is the one to show.
  }
};

/**
 * Publishes `content` at `path` only if nothing is there yet. The content goes to a temporary file
 * (0600) first, then is linked into place, which fails when the file exists: whoever links first
 * wins, and nobody ever reads half a file. Where links aren't supported, an exclusive create, whose
 * content follows a moment later (readers wait for it: `readWritten`). Returns false when the file
 * was already there.
 */
const createExclusive = (path: string, content: string): boolean => {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    writeFileSync(temporary, content, { mode: 0o600, flag: "wx" });
  } catch (error) {
    removeQuietly(temporary);
    throw error;
  }
  try {
    linkSync(temporary, path);
    return true;
  } catch (error) {
    if (isCode(error, "EEXIST")) return false;
    if (!isCode(error, "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EPERM", "EXDEV")) throw error;
  } finally {
    removeQuietly(temporary);
  }
  try {
    writeFileSync(path, content, { mode: 0o600, flag: "wx" });
    return true;
  } catch (error) {
    if (isCode(error, "EEXIST")) return false;
    throw error;
  }
};

/**
 * The file is there but holds no code: edited by hand, cut short by a crash, or empty. A start never
 * replaces it, since another server starting at the same moment could be reading or replacing it
 * too, and each would end with a code of its own. `setup-code` (one person, one process) replaces
 * it; until then the web setup refuses (161).
 */
export class SetupCodeFileError extends Error {
  readonly code = "ESETUPCODE";
  constructor(readonly path: string) {
    super(`${path} doesn't hold a setup code. Delete it, or run setup-code to replace it.`);
    this.name = "SetupCodeFileError";
  }
}

/** Waits, without a timer, in a synchronous path: a few milliseconds at most. */
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * The code another process is writing. With the exclusive create (no hard links), the file exists
 * a moment before its content does, so an empty or short read is retried for about half a second
 * before the file is taken as holding no code.
 */
const readWritten = (path: string): string | null => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = readSetupCode(path);
    if (code) return code;
    pause(10);
  }
  return null;
};

/** Tightens a file holding the code to 0600 when others can read it (copied, restored, by hand). */
const tighten = (path: string) => {
  try {
    if ((statSync(path).mode & 0o077) !== 0) chmodSync(path, 0o600);
  } catch {
    // Not ours to change: the code still works, and the folder is the operator's.
  }
};

/**
 * Replaces a file that doesn't hold a code with a new one, through a temporary file and a rename.
 * For `setup-code` only, run by a person on the server: never at a start (SetupCodeFileError).
 */
const replaceFile = (path: string, content: string) => {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    writeFileSync(temporary, content, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } catch (error) {
    removeQuietly(temporary);
    throw error;
  }
};

export type SetupCodeResult = { code: string; created: boolean };

/**
 * The code in the file, made and written first when there isn't one. Several servers starting at
 * once (111) all end with the same code: one writes it, the others read it. Throws when the folder
 * can't be written (the caller logs `setup.code_unwritable`), and SetupCodeFileError when the file
 * holds no code, unless `replaceInvalid` (`setup-code`) says to replace it.
 */
export const ensureSetupCode = (
  path: string,
  options: { replaceInvalid?: boolean } = {},
): SetupCodeResult => {
  const existing = readSetupCode(path);
  if (existing) {
    tighten(path);
    return { code: existing, created: false };
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const code = makeSetupCode();
  if (createExclusive(path, `${code}\n`)) return { code, created: true };
  // Someone else wrote it first (read it, waiting out a write in progress), or a file that isn't a
  // code is in the way.
  const written = readWritten(path);
  if (written) {
    tighten(path);
    return { code: written, created: false };
  }
  if (!options.replaceInvalid) throw new SetupCodeFileError(path);
  replaceFile(path, `${code}\n`);
  return { code, created: true };
};

/** Deletes the code once root exists, or for `reset-setup`. A missing file is fine. */
export const deleteSetupCode = (path: string): void => {
  rmSync(path, { force: true });
};
