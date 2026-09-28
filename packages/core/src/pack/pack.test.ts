import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DEFAULT_LIMITS } from "../limits.js";
import type { PackageFile } from "../package-file.js";
import { PackError, packItem, unpackItem } from "./pack.js";
import { readTar, writeTar } from "./tar.js";

const utf8 = (text: string) => new TextEncoder().encode(text);
const file = (path: string, content: string, executable = false): PackageFile => ({
  path,
  bytes: utf8(content),
  ...(executable ? { executable } : {}),
});
const MANIFEST =
  '# The reviewer\nname: "@a/reviewer"\ntype: agent\ndescription: Reviews.\nagent:\n  prompt: prompt.md # the system prompt\n';
const files = () => [
  file("ronne.yaml", MANIFEST),
  file("prompt.md", "Review the diff."),
  file("scripts/check.sh", "#!/bin/sh\necho ok\n", true),
  file(".ronne/layout.json", "{}"),
];

/** The entries of a packed item, straight from its tar. */
const entries = (tgz: Uint8Array) => {
  const out: { path: string; mode: number; size: number }[] = [];
  readTar(gunzipSync(tgz), (e) => out.push({ path: e.path, mode: e.mode, size: e.bytes.length }));
  return out;
};

describe("packItem", () => {
  it("is deterministic: the same files and version give the same bytes and SHA-256", async () => {
    const a = await packItem(files(), { version: "1.0.0" });
    const b = await packItem([...files()].reverse(), { version: "1.0.0" });
    expect(Buffer.from(b.tgz).equals(Buffer.from(a.tgz))).toBe(true);
    expect(b.sha256).toBe(a.sha256);
    expect(a.sha256).toBe(createHash("sha256").update(a.tgz).digest("hex"));
    expect(a.size).toBe(a.tgz.length);
    const other = await packItem(files(), { version: "1.0.1" });
    expect(other.sha256).not.toBe(a.sha256);
  });

  it("writes package/ entries sorted by path, with fixed modes, and leaves out .ronne/", async () => {
    const { tgz } = await packItem(files(), { version: "1.0.0" });
    expect(entries(tgz).map(({ path, mode }) => [path, mode.toString(8)])).toEqual([
      ["package/prompt.md", "644"],
      ["package/ronne.yaml", "644"],
      ["package/scripts/check.sh", "755"],
    ]);
    // The gzip header carries no time (bytes 4–7) and no file name (flag 0x08 unset).
    expect(Array.from(tgz.subarray(4, 8))).toEqual([0, 0, 0, 0]);
    expect((tgz[3] ?? 0) & 0x08).toBe(0);
  });

  it("sets version in ronne.yaml, keeping comments and key order, with \\n line ends", async () => {
    const withCrlf = [file("ronne.yaml", MANIFEST.replaceAll("\n", "\r\n")), ...files().slice(1)];
    const [unpacked] = unpackItem((await packItem(withCrlf, { version: "2.1.0" })).tgz).filter(
      (f) => f.path === "ronne.yaml",
    );
    const text = new TextDecoder().decode(unpacked?.bytes);
    expect(text).toContain("# The reviewer");
    expect(text).toContain("# the system prompt");
    expect(text).not.toContain("\r");
    expect(parse(text)).toMatchObject({ name: "@a/reviewer", version: "2.1.0" });
    expect(Object.keys(parse(text))[0]).toBe("name");
  });

  it("refuses unsafe paths, a missing manifest, and packages over 5 MB", async () => {
    await expect(packItem([file("prompt.md", "x")], { version: "1.0.0" })).rejects.toMatchObject({
      code: "manifest_missing",
    });
    await expect(
      packItem([...files(), file("../evil", "x")], { version: "1.0.0" }),
    ).rejects.toMatchObject({
      code: "path_invalid",
    });
    const random = new Uint8Array(200_000);
    for (let i = 0; i < random.length; i += 65536)
      crypto.getRandomValues(random.subarray(i, i + 65536));
    await expect(
      packItem([...files(), { path: "blob.bin", bytes: random }], {
        version: "1.0.0",
        limits: { ...DEFAULT_LIMITS, maxPackedBytes: 100_000 },
      }),
    ).rejects.toMatchObject({ code: "package_too_large" });
  });

  it("packs long paths through ustar's prefix field", async () => {
    const deep = `${"folder/".repeat(20)}file.md`;
    const [entry] = entries(
      (await packItem([file("ronne.yaml", MANIFEST), file(deep, "x")], { version: "1.0.0" })).tgz,
    ).filter((e) => e.path.endsWith("file.md"));
    expect(entry?.path).toBe(`package/${deep}`);
  });
});

describe("unpackItem", () => {
  it("gives back exactly what was packed, apart from .ronne/ and the version", async () => {
    const { tgz } = await packItem(files(), { version: "1.0.0" });
    const back = unpackItem(tgz);
    expect(back.map((f) => f.path).sort()).toEqual(["prompt.md", "ronne.yaml", "scripts/check.sh"]);
    const byPath = new Map(back.map((f) => [f.path, f]));
    expect(new TextDecoder().decode(byPath.get("prompt.md")?.bytes)).toBe("Review the diff.");
    expect(byPath.get("scripts/check.sh")?.executable).toBe(true);
    expect(byPath.get("prompt.md")?.executable).toBeUndefined();
  });

  const tgzOf = (entries: { path: string; content?: string; mode?: number }[]) =>
    gzipSync(
      writeTar(
        entries.map((e) => ({
          path: e.path,
          bytes: utf8(e.content ?? "x"),
          mode: e.mode ?? 0o644,
        })),
      ),
    );

  it("refuses archives that escape package/, repeat a path, or have no manifest", () => {
    const refused = (tgz: Uint8Array) => {
      try {
        unpackItem(tgz);
        return null;
      } catch (error) {
        return error instanceof PackError ? error.code : String(error);
      }
    };
    expect(
      refused(tgzOf([{ path: "package/ronne.yaml" }, { path: "package/../../etc/passwd" }])),
    ).toBe("path_invalid");
    expect(refused(tgzOf([{ path: "package/ronne.yaml" }, { path: "other/file" }]))).toBe(
      "path_invalid",
    );
    expect(
      refused(
        tgzOf([{ path: "package/ronne.yaml" }, { path: "package/a" }, { path: "package/a" }]),
      ),
    ).toBe("path_duplicate");
    expect(refused(tgzOf([{ path: "package/prompt.md" }]))).toBe("manifest_missing");
    expect(refused(utf8("not gzip at all"))).toBe("not_gzip");
  });

  it("refuses links and anything that isn't a regular file", () => {
    const tar = writeTar([{ path: "package/ronne.yaml", bytes: utf8("x"), mode: 0o644 }]);
    tar[156] = "2".charCodeAt(0); // a symlink
    // Fix the checksum, so it's the entry type that's refused, not a damaged header.
    tar.fill(0x20, 148, 156);
    const sum = tar.subarray(0, 512).reduce((total, byte) => total + byte, 0);
    tar.set(utf8(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
    expect(() => unpackItem(gzipSync(tar))).toThrow(
      expect.objectContaining({ code: "tar_entry_type" }),
    );
  });

  it("refuses more files, bigger files or more bytes than the limits, and a small gzip bomb", () => {
    const limits = { ...DEFAULT_LIMITS, maxFiles: 2, maxFileBytes: 10, maxTotalBytes: 15 };
    const code = (tgz: Uint8Array) => {
      try {
        unpackItem(tgz, limits);
        return null;
      } catch (error) {
        return (error as PackError).code;
      }
    };
    expect(
      code(tgzOf([{ path: "package/ronne.yaml" }, { path: "package/a" }, { path: "package/b" }])),
    ).toBe("too_many_files");
    expect(code(tgzOf([{ path: "package/ronne.yaml", content: "x".repeat(11) }]))).toBe(
      "file_too_large",
    );
    expect(
      code(
        tgzOf([
          { path: "package/ronne.yaml", content: "x".repeat(9) },
          { path: "package/a", content: "x".repeat(9) },
        ]),
      ),
    ).toBe("package_too_large");
    // 50 MB of zeros compresses to about 50 KB: it's stopped while decompressing.
    const bomb = gzipSync(new Uint8Array(50 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(100_000);
    expect(() => unpackItem(bomb)).toThrow(expect.objectContaining({ code: "package_too_large" }));
  });
});
