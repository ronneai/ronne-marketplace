import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createTarWriter, isSafeTarPath, readTar, type TarEntry, tarFileHeader } from "./tar.js";

const utf8 = (text: string) => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** Writes entries through the streaming writer and returns the archive's bytes. */
const archive = async (add: (tar: ReturnType<typeof createTarWriter>) => Promise<void>) => {
  const chunks: Uint8Array[] = [];
  const tar = createTarWriter((chunk) => {
    chunks.push(chunk.slice());
  });
  await add(tar);
  await tar.end();
  const out = new Uint8Array(chunks.reduce((total, c) => total + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

/** The parts as a stream of chunks, as a file read in pieces would give them. */
const chunksOf = (...parts: string[]): AsyncIterable<Uint8Array> => Readable.from(parts.map(utf8));

/** The pax records of the extended header at the start of `bytes`. */
const paxRecords = (bytes: Uint8Array) => {
  expect(String.fromCharCode(bytes[156] ?? 0)).toBe("x");
  const size = Number.parseInt(decode(bytes.subarray(124, 135)), 8);
  return decode(bytes.subarray(512, 512 + size));
};

describe("the streaming tar writer (099)", () => {
  it("writes what readTar reads back, streamed or whole, with mode 0600 by default", async () => {
    const bytes = await archive(async (tar) => {
      await tar.addFile("backup.json", utf8('{"format":1}\n'));
      await tar.addStream("database/user/000001.jsonl", 11, chunksOf("{}\n", '{"a":1}\n'));
      await tar.addFile("empty", new Uint8Array());
    });
    expect(bytes.length % 512).toBe(0);
    const entries: TarEntry[] = [];
    readTar(bytes, (entry) => entries.push(entry));
    expect(entries.map((e) => [e.path, decode(e.bytes), e.mode])).toEqual([
      ["backup.json", '{"format":1}\n', 0o600],
      ["database/user/000001.jsonl", '{}\n{"a":1}\n', 0o600],
      ["empty", "", 0o600],
    ]);
  });

  it("gives a path longer than ustar holds in a pax header", () => {
    const path = `storage/${"a".repeat(120)}/${"b".repeat(150)}.tgz`;
    const header = tarFileHeader(path, 3);
    const record = paxRecords(header);
    expect(record).toBe(`${record.split(" ")[0]} path=${path}\n`);
    expect(Number(record.split(" ")[0])).toBe(new TextEncoder().encode(record).length);
    // Then the file's own ustar header, with a placeholder name and the real size.
    const file = header.subarray(header.length - 512);
    expect(String.fromCharCode(file[156] ?? 0)).toBe("0");
    expect(Number.parseInt(decode(file.subarray(124, 135)), 8)).toBe(3);
  });

  it("gives a size of 8 GiB or more in a pax header, and 0 in the ustar field", () => {
    const size = 8 * 1024 ** 3 + 5;
    const header = tarFileHeader("storage/big.bin", size);
    expect(paxRecords(header)).toBe(`19 size=${size}\n`); // 2 + 6 + 10 + 1 bytes
    const file = header.subarray(header.length - 512);
    expect(decode(file.subarray(0, 15))).toBe("storage/big.bin");
    expect(Number.parseInt(decode(file.subarray(124, 135)), 8)).toBe(0);
  });

  it("counts a pax record's own digits in its length, across a power of ten", () => {
    // " path=…\n" of 996 bytes is a record of 999; of 997, 1,001 (1,000 would miscount its digits).
    for (const extra of [0, 1, 2, 3, 4]) {
      const path = `p/${"x".repeat(987 + extra)}`;
      const record = paxRecords(tarFileHeader(path, 0));
      expect(Number(record.split(" ")[0])).toBe(new TextEncoder().encode(record).length);
    }
  });

  // Windows' tar prints names in the console's code page, not UTF-8; backups are made and read on
  // Linux and macOS (121), where tar is checked.
  it.skipIf(process.platform === "win32")(
    "is read by the system's tar, long paths included",
    async () => {
      const long = `storage/${"d".repeat(130)}/${"e".repeat(140)}/1.0.0.tgz`;
      const bytes = await archive(async (tar) => {
        await tar.addFile("backup.json", utf8("{}\n"));
        await tar.addFile(long, utf8("artifact"));
        await tar.addFile("storage/é/ü.txt", utf8("accents"));
      });
      const dir = mkdtempSync(join(tmpdir(), "ronne-tar-"));
      try {
        writeFileSync(join(dir, "a.tar"), bytes);
        const listed = execFileSync("tar", ["-tf", "a.tar"], { cwd: dir, encoding: "utf8" });
        expect(listed.split(/\r?\n/).filter(Boolean)).toEqual([
          "backup.json",
          long,
          "storage/é/ü.txt",
        ]);
        execFileSync("tar", ["-xf", "a.tar", long], { cwd: dir });
        expect(readFileSync(join(dir, long), "utf8")).toBe("artifact");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  it("refuses unsafe and repeated paths, wrong sizes, and anything after the end", async () => {
    await expect(
      archive(async (tar) => {
        await tar.addFile("a", utf8("1"));
        await tar.addFile("a", utf8("2"));
      }),
    ).rejects.toThrow("already in the archive");
    for (const path of ["", "/abs", "a//b", "a/./b", "../up", "a/..", "win\\path", "nul\0"]) {
      expect(isSafeTarPath(path), path).toBe(false);
      await expect(archive((tar) => tar.addFile(path, utf8("x")))).rejects.toThrow("isn't allowed");
    }
    await expect(archive((tar) => tar.addStream("short", 10, chunksOf("abc")))).rejects.toThrow(
      "shorter than the 10 bytes",
    );
    await expect(archive((tar) => tar.addStream("long", 2, chunksOf("abc")))).rejects.toThrow(
      "longer than the 2 bytes",
    );
    await expect(
      archive(async (tar) => {
        await tar.end();
        await tar.addFile("late", utf8("x"));
      }),
    ).rejects.toThrow("already finished");
  });

  it("refuses a path that isn't well-formed Unicode, so two can't become one", async () => {
    expect(isSafeTarPath("storage/a\uD800")).toBe(false);
    expect(isSafeTarPath("storage/a\uDC00")).toBe(false);
    expect(isSafeTarPath("storage/😀.txt")).toBe(true);
  });

  it("writes nothing more once an entry failed: not even the end", async () => {
    const chunks: Uint8Array[] = [];
    const tar = createTarWriter((chunk) => {
      chunks.push(chunk);
    });
    await tar.addFile("backup.json", utf8("{}"));
    await expect(tar.addStream("storage/short", 1000, chunksOf("abc"))).rejects.toThrow(
      "shorter than",
    );
    const written = chunks.length;
    await expect(tar.addFile("manifest.json", utf8("{}"))).rejects.toThrow("failed earlier");
    await expect(tar.end()).rejects.toThrow("failed earlier");
    expect(chunks).toHaveLength(written);
  });

  it("writes calls one at a time in the order made, even when nobody waits for them", async () => {
    const slow = async (chunk: Uint8Array) => {
      await new Promise((resolve) => setTimeout(resolve, chunk.length % 3));
    };
    const chunks: Uint8Array[] = [];
    const tar = createTarWriter(async (chunk) => {
      await slow(chunk);
      chunks.push(chunk.slice());
    });
    const late = new Readable({ read() {} });
    const stream = tar.addStream("s", 6, late);
    const done = Promise.all([
      tar.addFile("a", utf8("a".repeat(700))),
      tar.addFile("b", utf8("b".repeat(300))),
      tar.end(),
    ]);
    setTimeout(() => {
      late.push(utf8("abc"));
      late.push(utf8("def"));
      late.push(null);
    }, 5);
    await Promise.all([stream, done]);
    const bytes = Buffer.concat(chunks);
    const entries: TarEntry[] = [];
    readTar(bytes, (entry) => entries.push(entry));
    expect(entries.map((e) => [e.path, decode(e.bytes)])).toEqual([
      ["s", "abcdef"],
      ["a", "a".repeat(700)],
      ["b", "b".repeat(300)],
    ]);
  });

  it("refuses a call made from inside its own work rather than wait for itself", async () => {
    const tar = createTarWriter(() => {});
    const nested: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          await tar.addFile("nested", utf8("x"));
          return { done: true, value: undefined };
        },
      }),
    };
    await expect(tar.addStream("outer", 0, nested)).rejects.toThrow("from inside its own write");
    await expect(tar.end()).rejects.toThrow("failed earlier");

    const inWrite: ReturnType<typeof createTarWriter> = createTarWriter(async () => {
      await inWrite.addFile("w", utf8("x"));
    });
    await expect(inWrite.addFile("a", utf8("1"))).rejects.toThrow("from inside its own write");

    // Work started inside a call that adds once that call is over is an ordinary call.
    let later: Promise<void> | undefined;
    const deferred: ReturnType<typeof createTarWriter> = createTarWriter(() => {
      later ??= new Promise<void>((resolve, reject) =>
        setTimeout(() => deferred.addFile("after", utf8("x")).then(resolve, reject), 10),
      );
    });
    await deferred.addFile("first", utf8("1"));
    await expect(later).resolves.toBeUndefined();
  });

  it("waits for each write before the next (backpressure)", async () => {
    const order: string[] = [];
    const tar = createTarWriter(async (chunk) => {
      order.push(`start ${chunk.length}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(`done ${chunk.length}`);
    });
    await tar.addFile("a", utf8("xyz"));
    expect(order).toEqual(["start 512", "done 512", "start 3", "done 3", "start 509", "done 509"]);
  });
});
