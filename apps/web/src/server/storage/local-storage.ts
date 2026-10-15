import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, link, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { hidePathsUnder } from "../log/redact";
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
  // Its files are named after items: an error naming one writes `base/[path]` (feature 100).
  hidePathsUnder(base);
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

    // The folder, or while nothing is stored yet its nearest existing parent (the first put
    // creates it, as a STORAGE_PATH nothing has made yet), is a folder this process may create
    // files in: an access check, no file written (a full or read-only disk shows up here).
    check: async () => {
      let folder = base;
      for (;;) {
        try {
          if (!(await stat(folder)).isDirectory())
            throw new Error("The storage path isn't a folder.");
          break;
        } catch (error) {
          const parent = dirname(folder);
          if (!missing(error) || parent === folder) throw error;
          folder = parent;
        }
      }
      await access(folder, constants.W_OK | constants.X_OK);
    },

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
