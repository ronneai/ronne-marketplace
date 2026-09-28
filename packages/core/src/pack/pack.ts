import { Gunzip, gzipSync } from "fflate";
import { parseDocument } from "yaml";
import { DEFAULT_LIMITS, formatBytes, type PackageLimits } from "../limits.js";
import { pathProblem } from "../package-checks.js";
import type { PackageFile } from "../package-file.js";
import { readTar, TarError, writeTar } from "./tar.js";

export class PackError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PackError";
  }
}

export type PackedItem = {
  tgz: Uint8Array;
  /** Hex SHA-256 of `tgz`, stored with the version and checked by rmk on every download. */
  sha256: string;
  size: number;
};

const ROOT = "package/";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Web Crypto, so it works in Node (20+) and in browsers alike. */
export const sha256Hex = async (bytes: Uint8Array): Promise<string> =>
  hex(await globalThis.crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));

/** ronne.yaml with `version` set, keeping the author's comments and key order, with \n line ends. */
const manifestWithVersion = (bytes: Uint8Array, version: string): Uint8Array => {
  const doc = parseDocument(decoder.decode(bytes).replace(/\r\n?/g, "\n"));
  doc.set("version", version);
  return encoder.encode(doc.toString());
};

/**
 * Packs an item into a deterministic `.tgz` (feature 011): `package/` + each file, sorted by path,
 * mtime 0, uid and gid 0, mode 0644 (0755 when executable), and a gzip header with no name or
 * time. The same files and version always give the same bytes and SHA-256. Run it after
 * checkPackage: it only refuses what would make the archive itself wrong.
 */
export const packItem = async (
  files: readonly PackageFile[],
  options: { version: string; limits?: PackageLimits },
): Promise<PackedItem> => {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const manifest = files.find((file) => file.path === "ronne.yaml");
  if (!manifest) throw new PackError("manifest_missing", "The item has no ronne.yaml.");
  const entries = files
    .filter((file) => !file.path.startsWith(".ronne/"))
    .map((file) => {
      const problem = pathProblem(file.path);
      if (problem) throw new PackError("path_invalid", `The path ${file.path} ${problem}.`);
      return {
        path: `${ROOT}${file.path}`,
        bytes:
          file.path === "ronne.yaml"
            ? manifestWithVersion(file.bytes, options.version)
            : file.bytes,
        mode: file.executable ? 0o755 : 0o644,
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  let tar: Uint8Array;
  try {
    tar = writeTar(entries);
  } catch (error) {
    if (error instanceof TarError) throw new PackError(error.code, error.message);
    throw error;
  }
  const tgz = gzipSync(tar, { level: 9, mtime: 0 });
  if (tgz.length > limits.maxPackedBytes)
    throw new PackError(
      "package_too_large",
      `The package is ${formatBytes(tgz.length)} packed; the limit is ${formatBytes(limits.maxPackedBytes)}.`,
    );
  return { tgz, sha256: await sha256Hex(tgz), size: tgz.length };
};

/** Decompresses, stopping as soon as the output passes `max` bytes, so a small bomb can't fill memory. */
const gunzipCapped = (tgz: Uint8Array, max: number): Uint8Array => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Gunzip((chunk) => {
    total += chunk.length;
    if (total > max)
      throw new PackError("package_too_large", "The package unpacks to more than the size limit.");
    chunks.push(chunk);
  });
  try {
    for (let offset = 0; offset < tgz.length; offset += 64 * 1024)
      stream.push(tgz.subarray(offset, offset + 64 * 1024), offset + 64 * 1024 >= tgz.length);
  } catch (error) {
    if (error instanceof PackError) throw error;
    throw new PackError("not_gzip", "This isn't a gzip-compressed package.");
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

/**
 * Unpacks a package that packItem made, for rmk and tests. Everything is checked before anything
 * is returned: only regular files under `package/`, safe paths, no duplicates, and the limits.
 */
export const unpackItem = (
  tgz: Uint8Array,
  limits: PackageLimits = DEFAULT_LIMITS,
): PackageFile[] => {
  if (tgz.length > limits.maxPackedBytes)
    throw new PackError(
      "package_too_large",
      `The package is larger than ${formatBytes(limits.maxPackedBytes)}.`,
    );
  // The tar adds a header per file and padding, so allow for them on top of the files' own limit.
  const tar = gunzipCapped(tgz, limits.maxTotalBytes + (limits.maxFiles + 2) * 1024);
  const files: PackageFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  try {
    readTar(tar, (entry) => {
      if (!entry.path.startsWith(ROOT))
        throw new PackError("path_invalid", `${entry.path} isn't inside package/.`);
      const path = entry.path.slice(ROOT.length);
      const problem = pathProblem(path);
      if (problem) throw new PackError("path_invalid", `The path ${path} ${problem}.`);
      if (seen.has(path))
        throw new PackError("path_duplicate", `${path} appears twice in the package.`);
      seen.add(path);
      if (files.length + 1 > limits.maxFiles)
        throw new PackError(
          "too_many_files",
          `The package has more than ${limits.maxFiles} files.`,
        );
      if (entry.bytes.length > limits.maxFileBytes)
        throw new PackError(
          "file_too_large",
          `${path} is larger than ${formatBytes(limits.maxFileBytes)}.`,
        );
      total += entry.bytes.length;
      if (total > limits.maxTotalBytes)
        throw new PackError(
          "package_too_large",
          `The files add up to more than ${formatBytes(limits.maxTotalBytes)}.`,
        );
      files.push({ path, bytes: entry.bytes, ...(entry.mode & 0o111 ? { executable: true } : {}) });
    });
  } catch (error) {
    if (error instanceof TarError) throw new PackError(error.code, error.message);
    throw error;
  }
  if (!seen.has("ronne.yaml"))
    throw new PackError("manifest_missing", "The package has no ronne.yaml.");
  return files;
};
