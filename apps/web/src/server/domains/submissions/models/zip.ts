import { formatBytes, type PackageLimits, pathProblem } from "@ronneai/core";
import { inflateSync } from "fflate";
import { ZipImportError } from "../exceptions/errors";

/** One file from a .zip, with its path inside the item. */
export type ZipFile = { path: string; bytes: Uint8Array; executable: boolean };

type Entry = {
  name: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
  mode: number | null;
};

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;

/** Files that archivers add on their own; skipped, so they don't block unwrapping a top folder. */
const isJunk = (name: string) =>
  name.startsWith("__MACOSX/") || name === ".DS_Store" || name.endsWith("/.DS_Store");

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** The central directory: every entry's name, mode and sizes, read before anything is inflated. */
const centralDirectory = (zip: Uint8Array): Entry[] => {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end record is in the last 22 bytes, plus a comment of up to 64 KB.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--)
    if (view.getUint32(i, true) === EOCD) {
      end = i;
      break;
    }
  if (end === -1) throw new ZipImportError("it isn't a .zip file.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff)
    throw new ZipImportError(
      "it uses ZIP64, which is only needed for archives far over the limits.",
    );

  const entries: Entry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > zip.length || view.getUint32(offset, true) !== CENTRAL)
      throw new ZipImportError("its file list is damaged.");
    const madeBy = view.getUint16(offset + 4, true) >> 8;
    const flags = view.getUint16(offset + 8, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const external = view.getUint32(offset + 38, true);
    if (flags & 1) throw new ZipImportError("it's encrypted.");
    entries.push({
      name: decoder.decode(zip.subarray(offset + 46, offset + 46 + nameLength)),
      method: view.getUint16(offset + 10, true),
      crc: view.getUint32(offset + 16, true),
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true),
      // Unix archivers (made by 3) keep the file's mode in the high 16 bits.
      mode: madeBy === 3 ? external >>> 16 : null,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const inflate = (zip: Uint8Array, entry: Entry): Uint8Array => {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const at = entry.localOffset;
  if (at + 30 > zip.length || view.getUint32(at, true) !== LOCAL)
    throw new ZipImportError(`${entry.name} is damaged.`);
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const data = zip.subarray(start, start + entry.compressedSize);
  let bytes: Uint8Array;
  if (entry.method === 0) bytes = data;
  else if (entry.method === 8)
    try {
      // The output buffer has the declared size, so a lying entry can't grow past it; the CRC
      // check below then catches it.
      bytes = inflateSync(data, { out: new Uint8Array(entry.size) });
    } catch {
      throw new ZipImportError(`${entry.name} is damaged.`);
    }
  else throw new ZipImportError(`${entry.name} uses a compression method other than deflate.`);
  if (bytes.length !== entry.size || crc32(bytes) !== entry.crc)
    throw new ZipImportError(`${entry.name} is damaged.`);
  return bytes;
};

/**
 * Reads a .zip of an item (feature 012). Everything is checked against the limits before any file
 * is inflated: symlinks and other special files, paths outside the item, too many files, and sizes.
 * A single top-level folder is unwrapped, and archivers' own files (`__MACOSX/`, `.DS_Store`) are
 * skipped.
 */
export const readZip = (zip: Uint8Array, limits: PackageLimits): ZipFile[] => {
  if (zip.length > limits.maxTotalBytes)
    throw new ZipImportError(`it's over ${formatBytes(limits.maxTotalBytes)}.`);
  const entries = centralDirectory(zip).filter((entry) => !isJunk(entry.name));

  const files: Entry[] = [];
  for (const entry of entries) {
    const type = entry.mode === null ? 0 : entry.mode & S_IFMT;
    if (entry.name.endsWith("/") || type === S_IFDIR) continue;
    if (type !== 0 && type !== S_IFREG)
      throw new ZipImportError(`${entry.name} is a link or special file, not a regular file.`);
    const problem = pathProblem(entry.name);
    if (problem) throw new ZipImportError(`the path ${entry.name} ${problem}.`);
    files.push(entry);
  }
  if (files.length === 0) throw new ZipImportError("it has no files.");
  if (files.length > limits.maxFiles)
    throw new ZipImportError(`it has ${files.length} files; the limit is ${limits.maxFiles}.`);
  let total = 0;
  for (const entry of files) {
    if (entry.size > limits.maxFileBytes)
      throw new ZipImportError(
        `${entry.name} is ${formatBytes(entry.size)}; a file can be at most ${formatBytes(limits.maxFileBytes)}.`,
      );
    total += entry.size;
  }
  if (total > limits.maxTotalBytes)
    throw new ZipImportError(
      `its files add up to ${formatBytes(total)}; the limit is ${formatBytes(limits.maxTotalBytes)}.`,
    );

  const top = files[0]?.name.split("/")[0];
  const unwrap = files.every((entry) => entry.name.startsWith(`${top}/`));
  const seen = new Set<string>();
  return files.map((entry) => {
    const path = unwrap ? entry.name.slice(`${top}/`.length) : entry.name;
    if (seen.has(path)) throw new ZipImportError(`it has ${path} twice.`);
    seen.add(path);
    return {
      path,
      bytes: inflate(zip, entry),
      executable: entry.mode !== null && (entry.mode & 0o111) !== 0,
    };
  });
};
