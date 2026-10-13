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

/** One 512-byte ustar header. `size` is the entry's, or 0 when a pax header gives it. */
const ustarHeader = (fields: {
  name: string;
  prefix: string;
  size: number;
  mode: number;
  type: "0" | "x";
}): Uint8Array => {
  const h = new Uint8Array(BLOCK);
  put(h, 0, fields.name, 100);
  put(h, 100, octal(fields.mode, 8), 8);
  put(h, 108, octal(0, 8), 8); // uid
  put(h, 116, octal(0, 8), 8); // gid
  put(h, 124, octal(fields.size, 12), 12);
  put(h, 136, octal(0, 12), 12); // mtime: always 0, so packing is reproducible
  h.fill(0x20, 148, 156); // the checksum counts its own field as spaces
  h[156] = fields.type.charCodeAt(0); // "0": a regular file; "x": a pax header for the next one
  put(h, 257, "ustar\0", 6);
  put(h, 263, "00", 2);
  put(h, 345, fields.prefix, 155);
  const sum = h.reduce((total, byte) => total + byte, 0);
  put(h, 148, `${sum.toString(8).padStart(6, "0")}\0 `, 8);
  return h;
};

const header = (entry: TarEntry): Uint8Array =>
  ustarHeader({ ...splitPath(entry.path), size: entry.bytes.length, mode: entry.mode, type: "0" });

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

/** The smallest size ustar's 11 octal digits can't hold: 8 GiB. */
const USTAR_MAX_SIZE = 8 ** 11;

/** Zeros up to the next 512-byte boundary after `size` bytes. */
const padding = (size: number) => new Uint8Array((BLOCK - (size % BLOCK)) % BLOCK);

/** A pax record, `<length> <key>=<value>\n`, whose length counts its own digits. */
const paxRecord = (key: string, value: string): string => {
  const body = ` ${key}=${value}\n`;
  const bodyLength = encoder.encode(body).length;
  let length = bodyLength + 1;
  while (String(length).length + bodyLength !== length) length = String(length).length + bodyLength;
  return `${length}${body}`;
};

/** Where ustar can hold the path itself, its prefix and name; null when only pax can. */
const ustarPath = (path: string): { prefix: string; name: string } | null => {
  try {
    return splitPath(path);
  } catch (error) {
    if (error instanceof TarError) return null;
    throw error;
  }
};

/**
 * The header blocks for one regular file of `size` bytes (feature 099's backup format): a ustar
 * header, after a pax extended header when the path doesn't fit ustar's 255 bytes or the size
 * reaches 8 GiB. The bytes and their padding (`tarPadding`) follow.
 */
export const tarFileHeader = (path: string, size: number, mode = 0o600): Uint8Array => {
  if (!Number.isSafeInteger(size) || size < 0)
    throw new TarError("tar_size", `The size of ${path} isn't a whole number of bytes.`);
  const fits = ustarPath(path);
  const bigSize = size >= USTAR_MAX_SIZE;
  if (fits && !bigSize) return ustarHeader({ ...fits, size, mode, type: "0" });
  const records = encoder.encode(
    (fits ? "" : paxRecord("path", path)) + (bigSize ? paxRecord("size", String(size)) : ""),
  );
  // Readers take the path from the pax header; the ustar name is only a placeholder then.
  const placeholder = fits ?? { prefix: "", name: "ronne-pax-path" };
  const pax = ustarHeader({
    name: "ronne-pax-header",
    prefix: "",
    size: records.length,
    mode: 0o600,
    type: "x",
  });
  const file = ustarHeader({ ...placeholder, size: bigSize ? 0 : size, mode, type: "0" });
  const out = new Uint8Array(BLOCK + records.length + padding(records.length).length + BLOCK);
  out.set(pax, 0);
  out.set(records, BLOCK);
  out.set(file, out.length - BLOCK);
  return out;
};

/** The zeros that follow a file's bytes, up to the next 512-byte block. */
export const tarPadding = (size: number): Uint8Array => padding(size);

/** The end of an archive: two zero blocks. */
export const tarEnd = (): Uint8Array => new Uint8Array(2 * BLOCK);

/** Half of a UTF-16 pair without the other half. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** A path the backup format allows: relative, no empty, `.` or `..` segment, no `\` or NUL. */
export const isSafeTarPath = (path: string): boolean =>
  path.length > 0 &&
  // A lone surrogate isn't UTF-8: written as U+FFFD, two such paths would become one.
  !LONE_SURROGATE.test(path) &&
  !path.includes("\\") &&
  !path.includes("\0") &&
  path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");

export type TarWriter = {
  /** Adds a file whose bytes are all in hand. */
  addFile: (path: string, bytes: Uint8Array, mode?: number) => Promise<void>;
  /** Adds a file of `size` bytes from `chunks`, which must hold exactly that many. */
  addStream: (
    path: string,
    size: number,
    chunks: AsyncIterable<Uint8Array>,
    mode?: number,
  ) => Promise<void>;
  /** Writes the two end blocks. Nothing can be added after. */
  end: () => Promise<void>;
};

/**
 * Node.js's AsyncLocalStorage when there is one, reached without importing `node:` so the package
 * still loads elsewhere: the writer uses it to tell a call made from inside its own work from one
 * made beside it.
 */
type AsyncHooks = typeof import("node:async_hooks");
const asyncHooks = (
  globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
).process?.getBuiltinModule?.("node:async_hooks") as AsyncHooks | undefined;

/**
 * A tar written as it goes (099), never whole in memory: each entry's header, bytes and padding
 * go to `write` in order, which can wait (a file stream's backpressure). Regular files only, each
 * path once; pax headers where ustar can't hold the path or the size.
 *
 * Calls run one at a time, in the order made, so a buffer given to `addFile` is read when its turn
 * comes: it mustn't change until the call settles. `write` and the streams handed to `addStream`
 * must not add to the writer they feed: such a call would wait for the call it's part of. Where
 * Node.js can tell (the call comes from inside the running call), it fails with `tar_reentrant`;
 * a stream whose work started before it was handed over can't be told apart from an outside
 * caller, and would wait for ever.
 */
export const createTarWriter = (write: (chunk: Uint8Array) => Promise<void> | void): TarWriter => {
  const seen = new Set<string>();
  // Set while a call runs: a call made from inside it (from `write`, or a stream the writer is
  // reading) would wait in the queue for the call it's part of, so it fails instead of hanging.
  // The store is the call's token, cleared when the call settles: async work started inside a
  // call (a timer, a listener) keeps the store after the call ends, and may add to the archive
  // then, so only a call still running counts.
  const inside = asyncHooks ? new asyncHooks.AsyncLocalStorage<{ running: boolean }>() : null;
  let ended = false;
  // After any failure the archive is incomplete: nothing more is written to it.
  let failed = false;
  // Calls run one at a time, in the order they were made: one entry's bytes can't land inside
  // another's, even when a caller doesn't wait (`Promise.all`, or `end()` during a stream).
  let queue: Promise<void> = Promise.resolve();
  const guarded =
    <A extends unknown[]>(run: (...args: A) => Promise<void>) =>
    (...args: A): Promise<void> => {
      if (inside?.getStore()?.running)
        return Promise.reject(
          new TarError(
            "tar_reentrant",
            "The archive can't be added to from inside its own write or a stream it's reading.",
          ),
        );
      const call = queue.then(async () => {
        if (failed) throw new TarError("tar_failed", "The archive failed earlier and can't go on.");
        if (ended) throw new TarError("tar_ended", "The archive is already finished.");
        try {
          if (inside) {
            const token = { running: true };
            try {
              await inside.run(token, () => run(...args));
            } finally {
              token.running = false;
            }
          } else await run(...args);
        } catch (error) {
          failed = true;
          throw error;
        }
      });
      queue = call.catch(() => undefined);
      return call;
    };
  const begin = async (path: string, size: number, mode: number) => {
    if (!isSafeTarPath(path)) throw new TarError("tar_path", `The path ${path} isn't allowed.`);
    if (seen.has(path)) throw new TarError("tar_duplicate", `${path} is already in the archive.`);
    const header = tarFileHeader(path, size, mode);
    seen.add(path);
    await write(header);
  };
  return {
    addFile: guarded(async (path: string, bytes: Uint8Array, mode = 0o600) => {
      await begin(path, bytes.length, mode);
      if (bytes.length > 0) await write(bytes);
      const pad = padding(bytes.length);
      if (pad.length > 0) await write(pad);
    }),
    addStream: guarded(
      async (path: string, size: number, chunks: AsyncIterable<Uint8Array>, mode = 0o600) => {
        await begin(path, size, mode);
        let written = 0;
        for await (const chunk of chunks) {
          written += chunk.length;
          if (written > size)
            throw new TarError(
              "tar_size",
              `${path} is longer than the ${size} bytes it was given.`,
            );
          if (chunk.length > 0) await write(chunk);
        }
        if (written !== size)
          throw new TarError("tar_size", `${path} is shorter than the ${size} bytes it was given.`);
        const pad = padding(size);
        if (pad.length > 0) await write(pad);
      },
    ),
    end: guarded(async () => {
      ended = true;
      await write(tarEnd());
    }),
  };
};

/** What a streaming reader does with one entry's bytes, in order, then its end. */
export type TarEntrySink = {
  data: (chunk: Uint8Array) => Promise<void> | void;
  end: () => Promise<void> | void;
};

/** The largest pax extended header a reader takes: a path and a size are far smaller. */
const PAX_MAX = 64 * 1024;

/** The pax records a reader uses (`path`, `size`); others are ignored, as the format says. */
const parsePax = (bytes: Uint8Array): { path?: string; size?: number } => {
  const out: { path?: string; size?: number } = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    if (space === -1) throw new TarError("tar_corrupt", "The archive's pax header is damaged.");
    const lengthText = decoder.decode(bytes.subarray(offset, space));
    if (!/^[1-9][0-9]{0,5}$/.test(lengthText))
      throw new TarError("tar_corrupt", "The archive's pax header is damaged.");
    const length = Number(lengthText);
    const record = bytes.subarray(space + 1, offset + length);
    if (offset + length > bytes.length || bytes[offset + length - 1] !== 0x0a)
      throw new TarError("tar_corrupt", "The archive's pax header is damaged.");
    const body = new TextDecoder("utf-8", { fatal: true }).decode(record.subarray(0, -1));
    const equals = body.indexOf("=");
    if (equals <= 0) throw new TarError("tar_corrupt", "The archive's pax header is damaged.");
    const key = body.slice(0, equals);
    const value = body.slice(equals + 1);
    if (key === "path") out.path = value;
    else if (key === "size") {
      if (!/^(0|[1-9][0-9]{0,15})$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new TarError(
          "tar_corrupt",
          "The archive's pax header has a size that isn't a number.",
        );
      out.size = Number(value);
    }
    offset += length;
  }
  return out;
};

/**
 * Reads a tar written as it goes (099's backup format), pushed in pieces of any size, never whole
 * in memory: each regular file's path and size go to `onEntry`, whose sink gets its bytes in
 * order and then its end. Only what the format allows: ustar headers (magic and version checked,
 * checksum checked), regular files, each after at most one pax extended header whose `path` and
 * `size` it uses; safe paths, each once; then exactly two zero blocks and nothing after. Anything
 * else throws a TarError, and nothing more is read.
 */
export const createTarReader = (
  onEntry: (path: string, size: number) => Promise<TarEntrySink> | TarEntrySink,
) => {
  const seen = new Set<string>();
  let held: Uint8Array = new Uint8Array(0);
  // What the next bytes are: a header block, an entry's bytes, a pax header's bytes, or the end.
  let state: "header" | "data" | "pax" | "end" = "header";
  let remaining = 0;
  let pad = 0;
  let sink: TarEntrySink | null = null;
  let pax: { path?: string; size?: number } | null = null;
  let paxBytes: Uint8Array[] = [];
  let zeros = 0;
  let failed = false;
  const fail = (message: string) => new TarError("tar_corrupt", message);

  const readHeader = async (h: Uint8Array) => {
    if (h.every((byte) => byte === 0)) {
      if (pax) throw fail("The archive ends right after a pax header.");
      state = "end";
      zeros = 1;
      return;
    }
    const stored = readOctal(h, 148, 8);
    const sum = h.reduce((total, byte, i) => total + (i >= 148 && i < 156 ? 0x20 : byte), 0);
    if (sum !== stored) throw fail("The archive's header checksum doesn't match.");
    if (text(h, 257, 6) !== "ustar" || h[262] !== 0 || text(h, 263, 2) !== "00")
      throw fail("The archive isn't a ustar archive.");
    const type = String.fromCharCode(h[156] ?? 0);
    const size = readOctal(h, 124, 12);
    if (type === "x") {
      if (pax) throw fail("The archive has two pax headers in a row.");
      if (size > PAX_MAX) throw fail("The archive's pax header is too large.");
      pax = {};
      paxBytes = [];
      state = "pax";
      remaining = size;
      pad = padding(size).length;
      if (remaining + pad === 0) {
        pax = parsePax(new Uint8Array(0));
        state = "header";
      }
      return;
    }
    if (type !== "0")
      throw new TarError(
        "tar_entry_type",
        "The archive holds something other than regular files (a folder, a link…).",
      );
    const prefix = text(h, 345, 155);
    const name = text(h, 0, 100);
    const path = pax?.path ?? (prefix ? `${prefix}/${name}` : name);
    const length = pax?.size ?? size;
    pax = null;
    if (!isSafeTarPath(path)) throw new TarError("tar_path", `The path ${path} isn't allowed.`);
    if (seen.has(path)) throw new TarError("tar_duplicate", `${path} is in the archive twice.`);
    seen.add(path);
    sink = await onEntry(path, length);
    state = "data";
    remaining = length;
    pad = padding(length).length;
    if (remaining === 0) {
      await sink.end();
      sink = null;
      state = pad > 0 ? "data" : "header";
    }
  };

  const step = async (): Promise<boolean> => {
    if (state === "end") {
      if (held.length === 0) return false;
      if (zeros >= 2) throw fail("The archive has bytes after its end.");
      if (held.length < BLOCK) return false;
      const block = held.subarray(0, BLOCK);
      held = held.subarray(BLOCK);
      if (!block.every((byte) => byte === 0)) throw fail("The archive's end is damaged.");
      zeros++;
      return true;
    }
    if (state === "header") {
      if (held.length < BLOCK) return false;
      const block = held.subarray(0, BLOCK);
      held = held.subarray(BLOCK);
      await readHeader(block);
      return true;
    }
    if (held.length === 0) return false;
    if (remaining > 0) {
      const take = Math.min(remaining, held.length);
      const chunk = held.subarray(0, take);
      held = held.subarray(take);
      remaining -= take;
      if (state === "pax") paxBytes.push(chunk.slice());
      else await sink?.data(chunk);
      if (remaining === 0 && state === "data") {
        await sink?.end();
        sink = null;
      }
      return true;
    }
    const take = Math.min(pad, held.length);
    if (!held.subarray(0, take).every((byte) => byte === 0))
      throw fail("The archive's padding is damaged.");
    held = held.subarray(take);
    pad -= take;
    if (pad === 0) {
      if (state === "pax") {
        const all = new Uint8Array(paxBytes.reduce((n, b) => n + b.length, 0));
        let at = 0;
        for (const b of paxBytes) {
          all.set(b, at);
          at += b.length;
        }
        pax = parsePax(all);
        paxBytes = [];
      }
      state = "header";
    }
    return true;
  };

  const guard =
    <A extends unknown[]>(run: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      if (failed) throw fail("The archive failed to read earlier.");
      try {
        await run(...args);
      } catch (error) {
        failed = true;
        throw error;
      }
    };

  return {
    push: guard(async (chunk: Uint8Array) => {
      if (held.length === 0) held = chunk;
      else {
        const joined = new Uint8Array(held.length + chunk.length);
        joined.set(held);
        joined.set(chunk, held.length);
        held = joined;
      }
      while (await step()) {
        // Each step consumes what it can; stop when it needs more bytes.
      }
      // Keep a copy of the little that's left, not a view into the caller's buffer.
      held = held.slice();
    }),
    end: guard(async () => {
      if (state !== "end" || zeros < 2 || held.length > 0)
        throw fail("The archive ends in the middle: it was cut short.");
    }),
  };
};
