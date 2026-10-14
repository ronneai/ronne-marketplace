import { describe, expect, it } from "vitest";
import {
  createTarReader,
  createTarWriter,
  TarError,
  tarEnd,
  tarFileHeader,
  writeTar,
} from "./tar.js";

const utf8 = (text: string) => new TextEncoder().encode(text);

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** An archive from the streaming writer. */
const archive = async (entries: [string, Uint8Array][]) => {
  const chunks: Uint8Array[] = [];
  const tar = createTarWriter((chunk) => {
    chunks.push(chunk.slice());
  });
  for (const [path, bytes] of entries) await tar.addFile(path, bytes);
  await tar.end();
  return concat(chunks);
};

/** Reads `bytes` pushed `step` at a time; the entries, or the error. */
const read = async (bytes: Uint8Array, step = bytes.length || 1) => {
  const entries: { path: string; size: number; bytes: Uint8Array }[] = [];
  const reader = createTarReader((path, size) => {
    const parts: Uint8Array[] = [];
    return {
      data: (chunk) => {
        parts.push(chunk.slice());
      },
      end: () => {
        entries.push({ path, size, bytes: concat(parts) });
      },
    };
  });
  try {
    for (let i = 0; i < bytes.length; i += step) await reader.push(bytes.subarray(i, i + step));
    await reader.end();
    return { entries };
  } catch (error) {
    return { entries, error: error as TarError };
  }
};

/** A copy of `bytes` with the header at `at` changed by `edit` and its checksum made right again. */
const editHeader = (bytes: Uint8Array, at: number, edit: (h: Uint8Array) => void) => {
  const copy = bytes.slice();
  const h = copy.subarray(at, at + 512);
  edit(h);
  h.fill(0x20, 148, 156);
  const sum = h.reduce((total, byte) => total + byte, 0);
  h.set(utf8(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
  return copy;
};

describe("the streaming tar reader (099)", () => {
  it("reads back what the writer wrote, pushed in pieces of any size", async () => {
    const long = `database/${"t".repeat(150)}/${"p".repeat(120)}.jsonl`;
    const entries: [string, Uint8Array][] = [
      ["backup.json", utf8('{"format":1}\n')],
      ["database/user/000001.jsonl", new Uint8Array(1500).fill(7)],
      [long, utf8("a long path, through a pax header")],
      ["storage/empty.tgz", new Uint8Array(0)],
      ["storage/exact.tgz", new Uint8Array(1024).fill(1)],
      ["manifest.json", utf8("{}")],
    ];
    const bytes = await archive(entries);
    for (const step of [1, 7, 511, 512, 513, 4096, bytes.length]) {
      const { entries: got, error } = await read(bytes, step);
      expect(error, `step ${step}`).toBeUndefined();
      expect(
        got.map((e) => [e.path, e.bytes]),
        `step ${step}`,
      ).toEqual(entries);
      expect(got.map((e) => e.size)).toEqual(entries.map(([, b]) => b.length));
    }
    // The package writer's archives too (no pax).
    expect(
      (await read(writeTar([{ path: "a.txt", bytes: utf8("x"), mode: 0o644 }]))).entries,
    ).toHaveLength(1);
  });

  it("takes the size from a pax header over the ustar field", async () => {
    // A pax `size` record, as an entry of 8 GiB or more gets, here on a 3-byte one made by hand:
    // the ustar size field says 0, the pax header says 3.
    const base = writeTar([{ path: "f", bytes: new Uint8Array(0), mode: 0o600 }]).subarray(0, 512);
    const records = utf8("10 size=3\n");
    const octal = (n: number) => utf8(`${n.toString(8).padStart(11, "0")}\0`);
    const paxHeader = editHeader(base, 0, (h) => {
      h[156] = "x".charCodeAt(0);
      h.set(octal(records.length), 124);
    });
    const bytes = concat([
      paxHeader,
      records,
      new Uint8Array(512 - records.length),
      base,
      utf8("abc"),
      new Uint8Array(509),
      tarEnd(),
    ]);
    const { entries, error } = await read(bytes, 100);
    expect(error).toBeUndefined();
    expect(entries).toEqual([{ path: "f", size: 3, bytes: utf8("abc") }]);
  });

  it("refuses anything the format doesn't allow", async () => {
    const good = await archive([
      ["backup.json", utf8("{}")],
      ["manifest.json", utf8("{}")],
    ]);
    const second = 1024; // the second entry's header
    const cases: Record<string, Uint8Array> = {
      "a damaged checksum": (() => {
        const c = good.slice();
        c[10] = 0x41;
        return c;
      })(),
      "not ustar": editHeader(good, 0, (h) => h.set(utf8("gnutar"), 257)),
      "a folder": editHeader(good, 0, (h) => {
        h[156] = "5".charCodeAt(0);
      }),
      "a symbolic link": editHeader(good, 0, (h) => {
        h[156] = "2".charCodeAt(0);
      }),
      "a global pax header": editHeader(good, 0, (h) => {
        h[156] = "g".charCodeAt(0);
      }),
      "an old-style type": editHeader(good, 0, (h) => {
        h[156] = 0;
      }),
      "a path with ..": editHeader(good, 0, (h) => h.set(utf8("../x\0\0\0\0\0\0\0"), 0)),
      "an absolute path": editHeader(good, 0, (h) => h.set(utf8("/etc/x\0\0\0\0\0"), 0)),
      "the same path twice": editHeader(good, second, (h) => h.set(utf8("backup.json\0\0"), 0)),
      "cut in the middle of a file": good.subarray(0, 600),
      "cut before the end blocks": good.subarray(0, good.length - 1024),
      "one end block only": good.subarray(0, good.length - 512),
      "bytes after the end": concat([good, new Uint8Array(512)]),
      "a byte after the end": concat([good, new Uint8Array([0])]),
      "damaged padding": (() => {
        const c = good.slice();
        c[512 + 100] = 1; // inside the first entry's padding (its 2 bytes, then zeros)
        return c;
      })(),
      "nothing at all": new Uint8Array(0),
    };
    for (const [what, bytes] of Object.entries(cases)) {
      for (const step of [1, 512, bytes.length || 1]) {
        const { error } = await read(bytes, step);
        expect(error, `${what}, step ${step}`).toBeInstanceOf(TarError);
      }
    }
  });

  it("refuses two pax headers in a row, and a pax header with no file after it", async () => {
    const paxed = tarFileHeader(`d/${"y".repeat(200)}/z`, 1);
    const paxHeader = paxed.subarray(0, paxed.length - 512);
    const twice = concat([paxHeader, paxed, utf8("q"), new Uint8Array(511), tarEnd()]);
    expect((await read(twice)).error?.message).toMatch(/two pax headers/);
    const dangling = concat([paxHeader, tarEnd()]);
    expect((await read(dangling)).error?.message).toMatch(/right after a pax header/);
  });

  it("hands each entry's bytes over in order, and stops at the first failure", async () => {
    const bytes = await archive([
      ["a", utf8("first")],
      ["b", utf8("second")],
    ]);
    const damaged = bytes.slice();
    damaged[1024 + 10] = (damaged[1024 + 10] ?? 0) ^ 0xff; // the second header
    const { entries, error } = await read(damaged, 1);
    expect(entries.map((e) => e.path)).toEqual(["a"]);
    expect(error).toBeInstanceOf(TarError);
    // And refuses anything after.
    const reader = createTarReader(() => ({ data: () => undefined, end: () => undefined }));
    await expect(reader.push(damaged)).rejects.toThrow(TarError);
    await expect(reader.push(new Uint8Array(1))).rejects.toThrow(/failed to read earlier/);
  });
});
