import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type ContainerError,
  createOpener,
  createSealer,
  deriveKey,
  HEADER_BYTES,
  newHeader,
  parseHeader,
  passphraseBytes,
  TAG_BYTES,
  WRITE_PARAMS,
} from "./crypto";

// The encrypted container of docs/spec/backup-format.md (099). scrypt at N = 2^17 takes a moment,
// so each test derives as few keys as it can.

const CHUNK = WRITE_PARAMS.chunkSize;
const SEALED = CHUNK + TAG_BYTES;
const PASS = passphraseBytes("correct horse battery staple");

/** Seals `plain`, pushed in pieces of `step` bytes. */
const seal = async (plain: Uint8Array, passphrase = PASS, step = 10_000) => {
  const header = newHeader();
  const key = await deriveKey(passphrase, header);
  const out: Buffer[] = [];
  const sealer = createSealer(key, header, async (bytes) => {
    out.push(Buffer.from(bytes));
  });
  for (let i = 0; i < plain.length; i += step) await sealer.push(plain.subarray(i, i + step));
  await sealer.end();
  return Buffer.concat(out);
};

/** Opens `sealed`, pushed in pieces of `step` bytes; what it handed out, or the error. */
const open = async (sealed: Uint8Array, passphrase = PASS, step = 7_777) => {
  const plain: Buffer[] = [];
  const opener = createOpener(passphrase, (bytes) => {
    plain.push(Buffer.from(bytes));
  });
  try {
    for (let i = 0; i < sealed.length; i += step) await opener.push(sealed.subarray(i, i + step));
    await opener.end();
    return { plain: Buffer.concat(plain) };
  } catch (error) {
    return { error: error as ContainerError, handedOut: Buffer.concat(plain).length };
  }
};

/** The sealed chunks after the header. */
const chunksOf = (sealed: Buffer) => {
  const chunks: Buffer[] = [];
  for (let i = HEADER_BYTES; i < sealed.length; i += SEALED)
    chunks.push(sealed.subarray(i, i + SEALED));
  return chunks;
};

const damaged = expect.objectContaining({ code: "damaged" });

// scrypt is slow on purpose (about half a second a key), and slower while every suite runs at once.
describe("the encrypted container (099)", { timeout: 60_000 }, () => {
  it("writes the header the format gives, and the chunks it says", async () => {
    const plain = randomBytes(2 * CHUNK + 5);
    const sealed = await seal(plain);
    const header = parseHeader(sealed);
    expect(sealed.subarray(0, 8).toString("ascii")).toBe("RONNEBAK");
    expect([sealed[8], sealed[9], sealed[10], sealed[11], sealed[12]]).toEqual([1, 1, 17, 8, 1]);
    expect(sealed.readUInt32BE(29)).toBe(65_536);
    expect([...sealed.subarray(33, 40)]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(header.salt).toHaveLength(16);
    // Two full chunks and a last one of 5 bytes, each with its tag.
    expect(sealed.length).toBe(HEADER_BYTES + 2 * SEALED + 5 + TAG_BYTES);
    // A new salt every time.
    expect(newHeader().salt.equals(newHeader().salt)).toBe(false);
  });

  it("follows the format's construction exactly, as another reader would open it", async () => {
    const plain = randomBytes(CHUNK + 10);
    const sealed = await seal(plain);
    const header = sealed.subarray(0, HEADER_BYTES);
    // The key, the nonces and the AAD written out from the format spec, not from crypto.ts.
    const key = scryptSync(PASS, header.subarray(13, 29), 32, {
      N: 2 ** 17,
      r: 8,
      p: 1,
      maxmem: 256 * 2 ** 17 * 8,
    });
    const nonceOf = (i: number, last: boolean) =>
      Buffer.concat([Buffer.alloc(7), Buffer.from([0, 0, 0, i]), Buffer.from([last ? 1 : 0])]);
    const openChunk = (chunk: Buffer, i: number, last: boolean, aad: Buffer = header) => {
      const decipher = createDecipheriv("aes-256-gcm", key, nonceOf(i, last));
      decipher.setAAD(aad);
      decipher.setAuthTag(chunk.subarray(chunk.length - TAG_BYTES));
      return Buffer.concat([
        decipher.update(chunk.subarray(0, chunk.length - TAG_BYTES)),
        decipher.final(),
      ]);
    };
    const [c0, c1] = chunksOf(sealed) as [Buffer, Buffer];
    expect(Buffer.concat([openChunk(c0, 0, false), openChunk(c1, 1, true)])).toEqual(plain);
    // Each chunk opens only at its own position, only the last with the flag, only with the header.
    expect(() => openChunk(c0, 0, true)).toThrow();
    expect(() => openChunk(c1, 1, false)).toThrow();
    expect(() => openChunk(c0, 1, false)).toThrow();
    expect(() => openChunk(c0, 0, false, Buffer.alloc(HEADER_BYTES))).toThrow();
  });

  it("opens what it sealed, at every size around a chunk's", async () => {
    for (const size of [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 3 * CHUNK, 3 * CHUNK + 1234]) {
      const plain = randomBytes(size);
      const sealed = await seal(plain, PASS, size % 3 === 0 ? 4096 : 65_537);
      // The last chunk is always shorter than a full one: empty when the plain bytes fill
      // their chunks exactly.
      const last = (sealed.length - HEADER_BYTES) % SEALED;
      expect(last, `size ${size}`).toBe((size % CHUNK) + TAG_BYTES);
      const { plain: opened, error } = await open(sealed, PASS, size % 2 ? 1 : 100_000);
      expect(error, `size ${size}`).toBeUndefined();
      expect(
        createHash("sha256")
          .update(opened as Buffer)
          .digest("hex"),
        `size ${size}`,
      ).toBe(createHash("sha256").update(plain).digest("hex"));
    }
  });

  it("refuses a wrong passphrase", async () => {
    const sealed = await seal(randomBytes(1000));
    expect((await open(sealed, passphraseBytes("Correct horse battery staple"))).error).toEqual(
      damaged,
    );
  });

  it("refuses a cut, reordered, spliced, altered or extended archive", async () => {
    const plain = randomBytes(3 * CHUNK + 100);
    const sealed = await seal(plain);
    const header = sealed.subarray(0, HEADER_BYTES);
    const [c0, c1, c2, c3] = chunksOf(sealed) as [Buffer, Buffer, Buffer, Buffer];
    const other = await seal(randomBytes(3 * CHUNK + 100));
    const flip = (buffer: Buffer, at: number) => {
      const copy = Buffer.from(buffer);
      copy[at] = (copy[at] as number) ^ 0x01;
      return copy;
    };
    const cases: Record<string, Buffer> = {
      "the last chunk dropped": Buffer.concat([header, c0, c1, c2]),
      "cut inside the last chunk": sealed.subarray(0, sealed.length - 10),
      "cut inside a full chunk": sealed.subarray(0, HEADER_BYTES + SEALED + 100),
      "cut to the header": header,
      "cut inside the header": sealed.subarray(0, 20),
      "two chunks swapped": Buffer.concat([header, c1, c0, c2, c3]),
      "a chunk repeated": Buffer.concat([header, c0, c0, c1, c2, c3]),
      "a chunk dropped from the middle": Buffer.concat([header, c0, c2, c3]),
      "a chunk from another archive": Buffer.concat([
        header,
        c0,
        chunksOf(other)[1] as Buffer,
        c2,
        c3,
      ]),
      "another archive's header": Buffer.concat([other.subarray(0, HEADER_BYTES), c0, c1, c2, c3]),
      "a bit flipped in a chunk": flip(sealed, HEADER_BYTES + 5),
      "a bit flipped in a tag": flip(sealed, HEADER_BYTES + SEALED - 1),
      "a bit flipped in the salt": flip(sealed, 20),
      "a bit flipped in the last chunk": flip(sealed, sealed.length - TAG_BYTES - 1),
      "bytes after the last chunk": Buffer.concat([sealed, Buffer.from([0])]),
      "a full chunk as the last": Buffer.concat([header, c0, c1, c2, c3.subarray(0, 0), c0]),
    };
    for (const [what, bytes] of Object.entries(cases))
      expect((await open(bytes)).error, what).toEqual(damaged);
  });

  it("refuses a dropped empty last chunk, and a full chunk sealed as the last", async () => {
    // An exact multiple of the chunk size: its last chunk is empty, a tag alone.
    const plain = randomBytes(2 * CHUNK);
    const sealed = await seal(plain);
    expect((await open(sealed.subarray(0, sealed.length - TAG_BYTES))).error).toEqual(damaged);
    // A full chunk sealed with the last flag at its right position: authentic as a chunk, but
    // the last chunk is never full, so the length rule alone refuses it.
    const header = parseHeader(sealed);
    const key = await deriveKey(PASS, header);
    const cipher = createCipheriv(
      "aes-256-gcm",
      key,
      Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]),
    );
    cipher.setAAD(header.bytes);
    const fullLast = Buffer.concat([
      cipher.update(plain.subarray(CHUNK)),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    const forged = Buffer.concat([sealed.subarray(0, HEADER_BYTES + SEALED), fullLast]);
    expect((await open(forged)).error).toEqual(damaged);
  });

  it("refuses a header it doesn't know or accept, before deriving a key", async () => {
    const sealed = await seal(randomBytes(10));
    const withByte = (at: number, value: number) => {
      const copy = Buffer.from(sealed);
      copy[at] = value;
      return copy;
    };
    const withChunk = (size: number) => {
      const copy = Buffer.from(sealed);
      copy.writeUInt32BE(size, 29);
      return copy;
    };
    const code = async (bytes: Buffer) => (await open(bytes)).error?.code;
    expect(await code(withByte(0, 0x58))).toBe("not_encrypted");
    expect(await code(withByte(8, 2))).toBe("newer_container");
    expect(await code(withByte(9, 2))).toBe("newer_container");
    // 0 is no version at all: damaged, not newer.
    expect(await code(withByte(8, 0))).toBe("bad_header");
    expect(await code(withByte(9, 0))).toBe("bad_header");
    // Limits: log2(N) 15 to 18, r exactly 8, p 1 to 4, chunks 4 KiB to 1 MiB, reserved zero.
    for (const bytes of [
      withByte(10, 14),
      withByte(10, 19),
      withByte(11, 7),
      withByte(11, 9),
      withByte(12, 0),
      withByte(12, 5),
      withChunk(4_095),
      withChunk(1_048_577),
      withByte(39, 1),
    ])
      expect(await code(bytes)).toBe("bad_header");
    expect((await open(withByte(0, 0x58))).error?.message).toBe(
      "This isn't an encrypted Ronne backup.",
    );
    expect((await open(withByte(8, 2))).error?.message).toContain("encrypted by a newer Ronne");
  });

  it("hands out nothing after a failure, and refuses to go on", async () => {
    const sealed = await seal(randomBytes(3 * CHUNK + 100));
    const swapped = Buffer.concat([
      sealed.subarray(0, HEADER_BYTES),
      ...[1, 0, 2, 3].map((i) => chunksOf(sealed)[i] as Buffer),
    ]);
    const result = await open(swapped, PASS, swapped.length);
    expect(result.error).toEqual(damaged);
    expect(result.handedOut).toBe(0);
    const opener = createOpener(PASS, () => undefined);
    await expect(opener.push(swapped)).rejects.toEqual(damaged);
    // Refused by the guard itself, whatever comes next.
    await expect(opener.push(Buffer.alloc(1))).rejects.toThrow(/It failed to open earlier/);
    await expect(opener.end()).rejects.toThrow(/It failed to open earlier/);
    // An opener that read an archive to its end takes nothing more.
    const good = await seal(Buffer.from("x"));
    const done = createOpener(PASS, () => undefined);
    await done.push(good);
    await done.end();
    await expect(done.push(Buffer.alloc(1))).rejects.toThrow(/already read to its end/);
    // A sealer seals one archive: nothing after its end.
    const header = newHeader();
    const sealer = createSealer(await deriveKey(PASS, header), header, async () => undefined);
    await sealer.end();
    await expect(sealer.push(Buffer.from("more"))).rejects.toThrow(/already sealed/);
    await expect(sealer.end()).rejects.toThrow(/already sealed/);
  });

  it("uses the passphrase in Unicode NFC, without one trailing line break from a file", async () => {
    const composed = passphraseBytes("café au lait");
    expect(passphraseBytes("café au lait")).toEqual(composed);
    expect(passphraseBytes("café au lait\n", true)).toEqual(composed);
    expect(passphraseBytes("café au lait\r\n", true)).toEqual(composed);
    // Only one line break, only from a file: what's left is a control character, refused.
    expect(() => passphraseBytes("café au lait\n\n", true)).toThrow(/control character/);
    expect(() => passphraseBytes("café au lait\n")).toThrow(/control character/);
    expect(passphraseBytes(" café au lait", true)).not.toEqual(composed);
    expect(() => passphraseBytes("")).toThrow(/empty/);
    expect(() => passphraseBytes("\n", true)).toThrow(/empty/);
    // A lone surrogate would become U+FFFD: two passphrases, one key.
    expect(() => passphraseBytes("x\ud800")).toThrow(/valid Unicode/);
    expect(() => passphraseBytes("p\ufffdss")).toThrow(/valid Unicode/);
    expect(() => passphraseBytes("tab\there")).toThrow(/control character/);
    // The prompt takes these as line ends: refused like a line break.
    expect(() => passphraseBytes("a\u2028b")).toThrow(/control character/);
    expect(() => passphraseBytes("a\u2029b")).toThrow(/control character/);
    expect(() => passphraseBytes("two\nlines\n", true)).toThrow(/control character/);
    expect(passphraseBytes("😀")).toEqual(Buffer.from("😀"));
    const sealed = await seal(Buffer.from("x"), passphraseBytes("café au lait"));
    expect((await open(sealed, composed)).plain?.toString()).toBe("x");
  });
});
