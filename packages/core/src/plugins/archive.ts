import { type UnzipFileInfo, unzipSync, type ZipOptions, zipSync } from "fflate";
import { sha256Hex } from "../pack/pack.js";
import { pathProblem } from "../package-checks.js";
import type { PackageFile } from "../package-file.js";

export type PluginArchive = {
  bytes: Uint8Array;
  /** Hex SHA-256 of `bytes`, which a Claude Code marketplace entry carries (contract, The archive). */
  sha256: string;
};

/**
 * Local midnight on 1980-01-01, the earliest time a zip can say: zip times are local fields, so
 * building the date from local fields gives the same bytes in every time zone.
 */
const MTIME = new Date(1980, 0, 1);

/** Unix, so the external attributes carry the file's mode (and executables stay executable). */
const UNIX = 3;

/** A regular file's mode in a zip's external attributes: the high 16 bits. */
const attrs = (executable: boolean | undefined) => (executable ? 0o100755 : 0o100644) * 0x10000;

/**
 * A plugin's files as a zip, with the plugin root at the top (contract, The archive): sorted
 * paths, a fixed time and Unix modes, so the same files always give the same bytes and SHA-256.
 */
export const pluginArchive = async (files: readonly PackageFile[]): Promise<PluginArchive> => {
  const entries: Record<string, [Uint8Array, ZipOptions]> = {};
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of sorted) {
    const problem = pathProblem(file.path);
    if (problem) throw new Error(`The plugin path ${file.path} ${problem}.`);
    if (file.path in entries) throw new Error(`The plugin has ${file.path} twice.`);
    entries[file.path] = [
      file.bytes,
      { level: 9, mtime: MTIME, os: UNIX, attrs: attrs(file.executable) },
    ];
  }
  const bytes = zipSync(entries);
  return { bytes, sha256: await sha256Hex(bytes) };
};

/** What `readPluginArchive` refuses: bigger than Claude Code unpacks (1 GiB), or malformed. */
export class PluginArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginArchiveError";
  }
}

/** The most a plugin may unpack to (Claude Code's own limit for an archive, checked 2026-10-03). */
export const PLUGIN_ARCHIVE_MAX_BYTES = 1024 * 1024 * 1024;

const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/**
 * Each entry's Unix mode, by name, from the zip's central directory: fflate's unzip doesn't give
 * them, and a hook's script must stay executable. Only entries made on Unix carry one.
 */
const unixModes = (zip: Uint8Array): Map<string, number> => {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end record is at least 22 bytes, followed by a comment of at most 65,535.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--)
    if (view.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  if (end < 0) throw new PluginArchiveError("The plugin isn't a zip: it has no central directory.");
  const count = view.getUint16(end + 10, true);
  const modes = new Map<string, number>();
  let at = view.getUint32(end + 16, true);
  for (let n = 0; n < count; n++) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== CENTRAL_HEADER)
      throw new PluginArchiveError("The plugin's zip has a damaged central directory.");
    const madeOn = view.getUint16(at + 4, true) >> 8;
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    if (at + 46 + nameLength > zip.length)
      throw new PluginArchiveError("The plugin's zip has a damaged central directory.");
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    if (madeOn === UNIX) modes.set(name, view.getUint32(at + 38, true) >>> 16);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return modes;
};

/**
 * A plugin zip's files (078's mirror reads the instance's zips back), sorted by path, with
 * `executable` from their Unix modes. Throws `PluginArchiveError` for a path that could escape
 * the plugin's folder, a file twice, or more than `PLUGIN_ARCHIVE_MAX_BYTES` unpacked.
 */
export const readPluginArchive = (zip: Uint8Array): PackageFile[] => {
  const modes = unixModes(zip);
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip, {
      filter: (file: UnzipFileInfo) => {
        total += file.originalSize;
        if (total > PLUGIN_ARCHIVE_MAX_BYTES)
          throw new PluginArchiveError("The plugin unpacks to more than 1 GiB.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof PluginArchiveError) throw error;
    throw new PluginArchiveError(`The plugin's zip can't be read: ${(error as Error).message}`);
  }
  const files: PackageFile[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith("/")) continue;
    const problem = pathProblem(path);
    if (problem) throw new PluginArchiveError(`The plugin path ${path} ${problem}.`);
    const mode = modes.get(path) ?? 0o644;
    files.push({ path, bytes, ...(mode & 0o111 ? { executable: true } : {}) });
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
};
