/**
 * A minimal ustar writer and reader, only for Ronne's packages: regular files, no directories,
 * links or extended headers. Small enough to read in one go, and deterministic by construction.
 */
const BLOCK = 512;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type TarEntry = { path: string; bytes: Uint8Array; mode: number };

export class TarError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TarError";
  }
}

/** An octal number, zero-padded to `width - 1` digits and a NUL, as ustar wants. */
const octal = (value: number, width: number) => `${value.toString(8).padStart(width - 1, "0")}\0`;

const put = (header: Uint8Array, offset: number, text: string, width: number) => {
  const bytes = encoder.encode(text);
  if (bytes.length > width)
    throw new TarError("tar_field_too_long", `"${text}" doesn't fit in the archive header.`);
  header.set(bytes, offset);
};

/** Splits a path into ustar's prefix (≤155 bytes) and name (≤100 bytes), at a "/". */
const splitPath = (path: string): { prefix: string; name: string } => {
  if (encoder.encode(path).length <= 100) return { prefix: "", name: path };
  for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
    const prefix = path.slice(0, i);
    const name = path.slice(i + 1);
    if (encoder.encode(prefix).length <= 155 && encoder.encode(name).length <= 100)
      return { prefix, name };
  }
  throw new TarError("path_too_long", `The path ${path} is too long to pack.`);
};

const header = (entry: TarEntry): Uint8Array => {
  const h = new Uint8Array(BLOCK);
  const { prefix, name } = splitPath(entry.path);
  put(h, 0, name, 100);
  put(h, 100, octal(entry.mode, 8), 8);
  put(h, 108, octal(0, 8), 8); // uid
  put(h, 116, octal(0, 8), 8); // gid
  put(h, 124, octal(entry.bytes.length, 12), 12);
  put(h, 136, octal(0, 12), 12); // mtime: always 0, so packing is reproducible
  h.fill(0x20, 148, 156); // the checksum counts its own field as spaces
  h[156] = 0x30; // "0": a regular file
  put(h, 257, "ustar\0", 6);
  put(h, 263, "00", 2);
  put(h, 345, prefix, 155);
  const sum = h.reduce((total, byte) => total + byte, 0);
  put(h, 148, `${sum.toString(8).padStart(6, "0")}\0 `, 8);
  return h;
};

/** The archive for these entries, in the order given. */
export const writeTar = (entries: readonly TarEntry[]): Uint8Array => {
  const size = entries.reduce(
    (total, e) => total + BLOCK + Math.ceil(e.bytes.length / BLOCK) * BLOCK,
    2 * BLOCK,
  );
  const out = new Uint8Array(size);
  let offset = 0;
  for (const entry of entries) {
    out.set(header(entry), offset);
    offset += BLOCK;
    out.set(entry.bytes, offset);
    offset += Math.ceil(entry.bytes.length / BLOCK) * BLOCK;
  }
  return out; // the two zero blocks at the end are already zeros
};

const text = (bytes: Uint8Array, offset: number, width: number) => {
  const field = bytes.subarray(offset, offset + width);
  const end = field.indexOf(0);
  return decoder.decode(end === -1 ? field : field.subarray(0, end));
};

const readOctal = (bytes: Uint8Array, offset: number, width: number) => {
  const value = text(bytes, offset, width).trim();
  if (!/^[0-7]+$/.test(value))
    throw new TarError("tar_corrupt", "The archive's header is damaged.");
  return Number.parseInt(value, 8);
};

/** The entries of an archive that writeTar could have written. Anything else is refused. */
export const readTar = (bytes: Uint8Array, onEntry: (entry: TarEntry) => void): void => {
  let offset = 0;
  while (offset + BLOCK <= bytes.length) {
    const h = bytes.subarray(offset, offset + BLOCK);
    if (h.every((byte) => byte === 0)) return;
    const stored = readOctal(h, 148, 8);
    const sum = h.reduce((total, byte, i) => total + (i >= 148 && i < 156 ? 0x20 : byte), 0);
    if (sum !== stored)
      throw new TarError("tar_corrupt", "The archive's header checksum doesn't match.");
    const type = String.fromCharCode(h[156] ?? 0);
    if (type !== "0" && type !== "\0")
      throw new TarError(
        "tar_entry_type",
        type === "1" || type === "2"
          ? "The archive contains a link, which packages can't hold."
          : "The archive contains something other than regular files.",
      );
    const prefix = text(h, 345, 155);
    const name = text(h, 0, 100);
    const size = readOctal(h, 124, 12);
    const mode = readOctal(h, 100, 8);
    offset += BLOCK;
    if (offset + size > bytes.length)
      throw new TarError("tar_corrupt", "The archive ends in the middle of a file.");
    onEntry({
      path: prefix ? `${prefix}/${name}` : name,
      bytes: bytes.slice(offset, offset + size),
      mode,
    });
    offset += Math.ceil(size / BLOCK) * BLOCK;
  }
};
