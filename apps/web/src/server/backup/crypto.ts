import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";

/**
 * The encrypted container of `docs/spec/backup-format.md` (099): a 40-byte header, then the plain
 * archive sealed in chunks with AES-256-GCM under a key scrypt derives from a passphrase, each
 * chunk's nonce a counter with a last-chunk flag (the STREAM construction), so a cut, reordered,
 * spliced or altered archive fails to open instead of restoring part of it. Node.js's own crypto
 * only. Nothing here sees a file: bytes go in through `push` and come out through a callback.
 */

export const MAGIC = Buffer.from("RONNEBAK", "ascii");
export const HEADER_BYTES = 40;
export const TAG_BYTES = 16;
export const CONTAINER_VERSION = 1;
const KDF_SCRYPT = 1;

/** What a writer puts in the header (the format's version 1 values). */
export const WRITE_PARAMS = { log2N: 17, r: 8, p: 1, chunkSize: 65_536 } as const;

/** What a version 1 reader accepts, so an altered header can't make it spend unbounded memory. */
const LIMITS = { log2N: [15, 18], r: [8, 8], p: [1, 4], chunkSize: [4_096, 1_048_576] } as const;

export type ContainerHeader = {
  log2N: number;
  r: number;
  p: number;
  salt: Buffer;
  chunkSize: number;
  /** The 40 bytes as written: every chunk authenticates them. */
  bytes: Buffer;
};

/** The archive can't be opened: damaged, or the passphrase is wrong (GCM can't tell them apart). */
export class ContainerError extends Error {
  constructor(
    readonly code:
      | "not_encrypted"
      | "newer_container"
      | "bad_header"
      | "damaged"
      | "bad_passphrase"
      | "too_long",
    message: string,
  ) {
    super(message);
    this.name = "ContainerError";
  }
}

const DAMAGED =
  "The backup is damaged, or the passphrase is wrong (the two can't be told apart). Nothing was restored from it.";

/** A new header: the version 1 parameters and a new random salt. */
export const newHeader = (): ContainerHeader => {
  const bytes = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(bytes, 0);
  bytes[8] = CONTAINER_VERSION;
  bytes[9] = KDF_SCRYPT;
  bytes[10] = WRITE_PARAMS.log2N;
  bytes[11] = WRITE_PARAMS.r;
  bytes[12] = WRITE_PARAMS.p;
  const salt = randomBytes(16);
  salt.copy(bytes, 13);
  bytes.writeUInt32BE(WRITE_PARAMS.chunkSize, 29);
  // 33..39 reserved, zero.
  return { ...WRITE_PARAMS, salt, bytes };
};

/** Whether these bytes start like an encrypted archive (the first 8, its magic). */
export const isContainer = (start: Uint8Array): boolean =>
  start.length >= MAGIC.length && Buffer.from(start.subarray(0, MAGIC.length)).equals(MAGIC);

const within = (value: number, [low, high]: readonly [number, number]) =>
  value >= low && value <= high;

/** Reads and checks a header, refusing anything a version 1 reader doesn't know or accept. */
export const parseHeader = (start: Uint8Array): ContainerHeader => {
  if (!isContainer(start))
    throw new ContainerError("not_encrypted", "This isn't an encrypted Ronne backup.");
  if (start.length < HEADER_BYTES) throw new ContainerError("damaged", DAMAGED);
  const bytes = Buffer.from(start.subarray(0, HEADER_BYTES));
  // The header names no Ronne version, so a newer container can only be called that; 0 is no
  // version at all.
  if ((bytes[8] as number) > CONTAINER_VERSION || (bytes[9] as number) > KDF_SCRYPT)
    throw new ContainerError(
      "newer_container",
      "This backup was encrypted by a newer Ronne; install a newer version to read it.",
    );
  const header: ContainerHeader = {
    log2N: bytes[10] as number,
    r: bytes[11] as number,
    p: bytes[12] as number,
    salt: bytes.subarray(13, 29),
    chunkSize: bytes.readUInt32BE(29),
    bytes,
  };
  if (
    bytes[8] !== CONTAINER_VERSION ||
    bytes[9] !== KDF_SCRYPT ||
    bytes.subarray(33, 40).some((b) => b !== 0) ||
    !within(header.log2N, LIMITS.log2N) ||
    !within(header.r, LIMITS.r) ||
    !within(header.p, LIMITS.p) ||
    !within(header.chunkSize, LIMITS.chunkSize)
  )
    throw new ContainerError(
      "bad_header",
      "The backup's encryption header has values this Ronne doesn't accept: it's damaged, or from a newer Ronne.",
    );
  return header;
};

/**
 * Text a passphrase can be: no lone UTF-16 surrogate (in a `u` regex a paired one is one code
 * point, never `\p{Cs}`); no U+FFFD, which is what an undecodable byte becomes (Node decodes the
 * environment that way), so different bytes would make the same key; and nothing the terminal
 * prompt (Node's readline) acts on without a word, so a typed passphrase and the same one in a file
 * can't differ: control characters (tab, NUL, ESC that starts a key sequence, line breaks), and the
 * line and paragraph separators U+2028 and U+2029, which it takes as line ends.
 */
export const isWellFormedText = (text: string): boolean =>
  !/[\p{Cs}\p{Cc}\p{Zl}\p{Zp}\uFFFD]/u.test(text);

/**
 * A passphrase as the format uses it: Unicode NFC, one trailing `\n` or `\r\n` removed when it was
 * read from a file or the environment (`fromFile`), nothing else trimmed. Empty is refused.
 */
export const passphraseBytes = (passphrase: string, fromFile = false): Buffer => {
  const text = fromFile ? passphrase.replace(/\r?\n$/, "") : passphrase;
  if (text.length === 0) throw new ContainerError("bad_passphrase", "The passphrase is empty.");
  // A lone surrogate would become U+FFFD, and two passphrases the same key.
  if (!isWellFormedText(text))
    throw new ContainerError(
      "bad_passphrase",
      "The passphrase holds a control character or isn't valid Unicode text.",
    );
  return Buffer.from(text.normalize("NFC"), "utf8");
};

/** scrypt(passphrase, salt, N, r, p) → 32 bytes, with `maxmem = 256·N·r` (the format's rule). */
export const deriveKey = (passphrase: Buffer, header: ContainerHeader): Promise<Buffer> => {
  const N = 2 ** header.log2N;
  return new Promise((resolve, reject) =>
    scrypt(
      passphrase,
      header.salt,
      32,
      { N, r: header.r, p: header.p, maxmem: 256 * N * header.r },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
};

/** 7 zero bytes, the counter (4 bytes, big-endian), the last-chunk flag. */
const nonce = (counter: number, last: boolean) => {
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32BE(counter, 7);
  bytes[11] = last ? 1 : 0;
  return bytes;
};

const MAX_CHUNKS = 2 ** 32;

/**
 * Seals a plain archive as it's pushed: the header first, then each full chunk once a byte after
 * it has arrived (the last chunk is always shorter than the chunk size, so a full one can't be
 * the last), and at `end` the last chunk, empty when the archive filled its chunks exactly.
 */
export const createSealer = (
  key: Buffer,
  header: ContainerHeader,
  write: (bytes: Uint8Array) => Promise<void>,
) => {
  const size = header.chunkSize;
  let pending: Buffer[] = [];
  let held = 0;
  let counter = 0;
  let started = false;
  let ended = false;
  const seal = async (plain: Buffer, last: boolean) => {
    if (counter >= MAX_CHUNKS)
      throw new ContainerError("too_long", "The backup is too large to encrypt in one archive.");
    if (!started) {
      started = true;
      await write(header.bytes);
    }
    const cipher = createCipheriv("aes-256-gcm", key, nonce(counter, last));
    cipher.setAAD(header.bytes);
    const sealed = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    counter++;
    await write(sealed);
  };
  return {
    push: async (bytes: Uint8Array) => {
      if (ended) throw new ContainerError("damaged", "The archive was already sealed to its end.");
      // A copy: the caller may reuse its buffer.
      pending.push(Buffer.from(bytes));
      held += bytes.length;
      if (held <= size) return;
      let all = Buffer.concat(pending, held);
      while (all.length > size) {
        await seal(all.subarray(0, size), false);
        all = all.subarray(size);
      }
      pending = [all];
      held = all.length;
    },
    end: async () => {
      if (ended) throw new ContainerError("damaged", "The archive was already sealed to its end.");
      ended = true;
      const all = Buffer.concat(pending, held);
      pending = [];
      held = 0;
      if (all.length === size) {
        await seal(all, false);
        await seal(Buffer.alloc(0), true);
      } else await seal(all, true);
    },
  };
};

/**
 * Opens a sealed archive as it's pushed (header included) and hands each chunk's plain bytes to
 * `onPlain` once it has opened. A chunk is opened as the last only at `end`: whatever is still
 * held then must be shorter than a full sealed chunk and at least a tag long. Any failure throws
 * a ContainerError and nothing after it is handed out; the caller must treat what it already got
 * as unchecked until `end` succeeds.
 */
export const createOpener = (
  passphrase: Buffer,
  onPlain: (bytes: Uint8Array) => Promise<void> | void,
  options: { onHeader?: (header: ContainerHeader) => void } = {},
) => {
  let header: ContainerHeader | null = null;
  let key: Buffer | null = null;
  let pending: Buffer[] = [];
  let held = 0;
  let counter = 0;
  let failed = false;
  let ended = false;
  const open = async (sealed: Buffer, last: boolean) => {
    if (!key || !header) throw new ContainerError("damaged", DAMAGED);
    if (sealed.length < TAG_BYTES || counter >= MAX_CHUNKS)
      throw new ContainerError("damaged", DAMAGED);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce(counter, last));
    decipher.setAAD(header.bytes);
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    let plain: Buffer;
    try {
      plain = Buffer.concat([
        decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)),
        decipher.final(),
      ]);
    } catch {
      throw new ContainerError("damaged", DAMAGED);
    }
    counter++;
    await onPlain(plain);
  };
  const guard =
    <A extends unknown[]>(run: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      if (failed) throw new ContainerError("damaged", `It failed to open earlier. ${DAMAGED}`);
      if (ended) throw new ContainerError("damaged", "The backup was already read to its end.");
      try {
        await run(...args);
      } catch (error) {
        failed = true;
        throw error;
      }
    };
  return {
    push: guard(async (bytes: Uint8Array) => {
      pending.push(Buffer.from(bytes));
      held += bytes.length;
      // Joined only once there's something to open, so small pushes don't copy it all each time.
      if (!header ? held < HEADER_BYTES : held <= header.chunkSize + TAG_BYTES) return;
      let all = Buffer.concat(pending, held);
      if (!header) {
        header = parseHeader(all);
        options.onHeader?.(header);
        key = await deriveKey(passphrase, header);
        all = all.subarray(HEADER_BYTES);
      }
      const full = header.chunkSize + TAG_BYTES;
      // A full sealed chunk with more bytes after it is never the last one.
      while (all.length > full) {
        await open(all.subarray(0, full), false);
        all = all.subarray(full);
      }
      pending = [all];
      held = all.length;
    }),
    end: guard(async () => {
      ended = true;
      const rest = Buffer.concat(pending, held);
      pending = [];
      held = 0;
      // Shorter than a header: not a container at all, or a cut one.
      if (!header) {
        if (rest.length >= MAGIC.length) parseHeader(rest);
        throw new ContainerError("damaged", DAMAGED);
      }
      // A full chunk at the end means the last one was cut off.
      if (rest.length >= header.chunkSize + TAG_BYTES || rest.length < TAG_BYTES)
        throw new ContainerError("damaged", DAMAGED);
      await open(rest, true);
    }),
  };
};
