import { randomBytes } from "node:crypto";
import { link, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  type StorageAdapter,
  StorageConflictError,
  StorageKeyError,
  storageKeyProblem,
} from "./storage-adapter";

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * The StorageAdapter on local disk, under `root` (STORAGE_PATH). A put writes a temporary file and
 * then hard-links it into place, which fails if the file already exists, so two publishes can't
 * both write a key, and a reader never sees half a file.
 */
export const localStorage = (root: string): StorageAdapter => {
  const base = resolve(root);
  const pathOf = (key: string) => {
    if (storageKeyProblem(key)) throw new StorageKeyError(key);
    const path = resolve(base, key);
    if (!path.startsWith(`${base}${sep}`)) throw new StorageKeyError(key);
    return path;
  };
  const read = async (path: string) => {
    try {
      return new Uint8Array(await readFile(path));
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  };

  return {
    put: async (key, bytes) => {
      const path = pathOf(key);
      const existing = await read(path);
      if (existing) {
        if (sameBytes(existing, bytes)) return;
        throw new StorageConflictError(key);
      }
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(temporary, bytes, { flag: "wx" });
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        // Written meanwhile by someone else: fine if it's the same bytes.
        const written = await read(path);
        if (!written || !sameBytes(written, bytes)) throw new StorageConflictError(key);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },

    get: async (key) => read(pathOf(key)),

    exists: async (key) => (await read(pathOf(key))) !== null,

    size: async (key) => {
      try {
        return (await stat(pathOf(key))).size;
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
  };
};
