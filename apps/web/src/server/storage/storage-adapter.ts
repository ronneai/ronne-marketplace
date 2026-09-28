/**
 * Where published artifacts live (feature 015, MVP §4.2). Keys are relative paths such as
 * `team/secure-coding/1.0.0.tgz`. Artifacts are immutable: `put` never replaces different bytes,
 * and nothing is ever deleted (a yanked version keeps its file, MVP §3.4). Local disk for the MVP;
 * S3 can implement the same interface later (MVP §14).
 */
export interface StorageAdapter {
  /** Stores `bytes`; the same bytes again succeed (a retried publish), different ones throw. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** The bytes, or null if nothing is stored at `key`. Artifacts are at most 5 MB (MVP §12). */
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  /** The size in bytes, or null if nothing is stored at `key`. */
  size(key: string): Promise<number | null>;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A key that could escape the storage root: absolute, with `..`, or otherwise malformed. */
export class StorageKeyError extends StorageError {
  constructor(readonly key: string) {
    super(`"${key}" isn't a valid storage key.`);
  }
}

/** Different bytes for a key that's already stored: artifacts never change. */
export class StorageConflictError extends StorageError {
  constructor(readonly key: string) {
    super(`${key} is already stored with different content, and artifacts never change.`);
  }
}

/** Why a key is unsafe, or null: relative, with `/`, no empty, `.` or `..` segments. */
export const storageKeyProblem = (key: string): string | null => {
  if (!key || key.length > 512) return "empty or too long";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
  if (/[\u0000-\u001f\\]/.test(key)) return "control characters or backslashes";
  if (key.startsWith("/")) return "absolute";
  if (key.split("/").some((part) => part === "" || part === "." || part === ".."))
    return "segments";
  return null;
};
