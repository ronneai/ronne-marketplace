import { type ZipOptions, zipSync } from "fflate";
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
