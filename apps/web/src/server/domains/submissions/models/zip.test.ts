import { DEFAULT_LIMITS } from "@ronneai/core";
import { strToU8, type Zippable, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ZipImportError } from "../exceptions/errors";
import { readZip } from "./zip";

const REGULAR = 0o100644 << 16;
const EXECUTABLE = 0o100755 << 16;
const SYMLINK = 0o120777 << 16;
const unix = (bytes: Uint8Array, attrs = REGULAR): [Uint8Array, { os: number; attrs: number }] => [
  bytes,
  { os: 3, attrs },
];

const read = (files: Zippable, limits = DEFAULT_LIMITS) => readZip(zipSync(files), limits);
const paths = (files: Zippable) => read(files).map((file) => file.path);

describe("readZip", () => {
  it("reads files, keeps the executable bit, and unwraps a single top folder", () => {
    const files = read({
      "reviewer/": new Uint8Array(),
      "reviewer/ronne.yaml": unix(strToU8("name: x\n")),
      "reviewer/bin/run.sh": unix(strToU8("#!/bin/sh\n"), EXECUTABLE),
      "__MACOSX/reviewer/._ronne.yaml": strToU8("junk"),
      "reviewer/.DS_Store": strToU8("junk"),
    });
    expect(files.map((f) => [f.path, f.executable])).toEqual([
      ["ronne.yaml", false],
      ["bin/run.sh", true],
    ]);
    expect(new TextDecoder().decode(files[0]?.bytes)).toBe("name: x\n");
  });

  it("keeps paths as they are when there's more than one top-level entry", () => {
    expect(paths({ "ronne.yaml": strToU8("x"), "docs/a.md": strToU8("a") })).toEqual([
      "ronne.yaml",
      "docs/a.md",
    ]);
    // Stored (level 0) and deflated entries both read.
    expect(read({ "a.md": [strToU8("stored"), { level: 0 }] })[0]?.bytes).toEqual(
      strToU8("stored"),
    );
  });

  it("refuses paths outside the item, links and special files", () => {
    for (const files of [
      { "../escape.md": strToU8("x") },
      { "/etc/passwd": strToU8("x") },
      { "a\\b.md": strToU8("x") },
      { link: unix(strToU8("/etc/passwd"), SYMLINK) },
      { fifo: unix(new Uint8Array(), 0o010644 << 16) },
    ] as Zippable[])
      expect(() => read(files), JSON.stringify(Object.keys(files))).toThrow(ZipImportError);
  });

  it("refuses too many files, a big file, too much in total, and a big archive", () => {
    const small = { ...DEFAULT_LIMITS, maxFiles: 2, maxFileBytes: 3072, maxTotalBytes: 4096 };
    expect(() => read({ a: strToU8("1"), b: strToU8("2"), c: strToU8("3") }, small)).toThrow(
      "it has 3 files; the limit is 2.",
    );
    expect(() => read({ a: strToU8("x".repeat(4000)) }, small)).toThrow(
      "a is 4 KB; a file can be at most 3 KB.",
    );
    // Compressible, so the archive is small but its files add up to more than the total.
    expect(() =>
      read({ a: strToU8("x".repeat(3000)), b: strToU8("y".repeat(3000)) }, small),
    ).toThrow("its files add up to 6 KB; the limit is 4 KB.");
    // Incompressible bytes, so the archive itself is over the total.
    const noise = crypto.getRandomValues(new Uint8Array(30));
    expect(() => read({ a: [noise, { level: 0 }] }, { ...small, maxTotalBytes: 25 })).toThrow(
      "it's over 1 KB.",
    );
  });

  it("refuses an entry that lies about its size, so it can't expand past the limits", () => {
    const zip = zipSync({ "bomb.txt": strToU8("x".repeat(100_000)) });
    // Declare 100 bytes in both headers: the check passes, but the data doesn't match.
    const view = new DataView(zip.buffer);
    for (let i = 0; i < zip.length - 4; i++) {
      if (view.getUint32(i, true) === 0x04034b50) view.setUint32(i + 22, 100, true);
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, 100, true);
    }
    expect(() => readZip(zip, DEFAULT_LIMITS)).toThrow("bomb.txt is damaged.");
  });

  it("refuses what isn't a zip, and encrypted archives", () => {
    expect(() => readZip(strToU8("not a zip at all, just text"), DEFAULT_LIMITS)).toThrow(
      "it isn't a .zip file.",
    );
    const zip = zipSync({ "a.md": strToU8("a") });
    const view = new DataView(zip.buffer);
    for (let i = 0; i < zip.length - 4; i++)
      if (view.getUint32(i, true) === 0x02014b50) view.setUint16(i + 8, 1, true);
    expect(() => readZip(zip, DEFAULT_LIMITS)).toThrow("it's encrypted.");
    expect(() => read({ "empty/": new Uint8Array() })).toThrow("it has no files.");
  });
});
