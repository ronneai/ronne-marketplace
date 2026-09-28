import { describe, expect, it } from "vitest";
import { type MergeFile, mergeFiles } from "./rebase";

const f = (content: string, executable = false): MergeFile => ({
  encoding: "utf8",
  content,
  executable,
});
const files = (entries: Record<string, MergeFile>) => new Map(Object.entries(entries));
const merged = (
  base: Record<string, MergeFile>,
  mine: Record<string, MergeFile>,
  theirs: Record<string, MergeFile>,
) => {
  const result = mergeFiles(files(base), files(mine), files(theirs));
  return {
    files: Object.fromEntries([...result.files].map(([path, file]) => [path, file.content])),
    conflicts: result.conflicts,
  };
};

describe("mergeFiles", () => {
  it("keeps a file nobody changed", () => {
    expect(merged({ a: f("1") }, { a: f("1") }, { a: f("1") })).toEqual({
      files: { a: "1" },
      conflicts: [],
    });
  });

  it("keeps the author's change when only the author changed a file", () => {
    expect(merged({ a: f("1") }, { a: f("mine") }, { a: f("1") })).toEqual({
      files: { a: "mine" },
      conflicts: [],
    });
  });

  it("takes the newer version's change when only it changed a file", () => {
    expect(merged({ a: f("1") }, { a: f("1") }, { a: f("theirs") })).toEqual({
      files: { a: "theirs" },
      conflicts: [],
    });
  });

  it("keeps the author's and lists a conflict when both changed a file differently", () => {
    expect(merged({ a: f("1") }, { a: f("mine") }, { a: f("theirs") })).toEqual({
      files: { a: "mine" },
      conflicts: ["a"],
    });
  });

  it("isn't a conflict when both made the same change", () => {
    expect(merged({ a: f("1") }, { a: f("2") }, { a: f("2") })).toEqual({
      files: { a: "2" },
      conflicts: [],
    });
  });

  it("follows a side that added a file", () => {
    expect(merged({}, { mine: f("m") }, {})).toEqual({ files: { mine: "m" }, conflicts: [] });
    expect(merged({}, {}, { theirs: f("t") })).toEqual({ files: { theirs: "t" }, conflicts: [] });
    expect(merged({}, { both: f("x") }, { both: f("x") })).toEqual({
      files: { both: "x" },
      conflicts: [],
    });
  });

  it("lists a conflict when both added a file with different content, keeping the author's", () => {
    expect(merged({}, { a: f("m") }, { a: f("t") })).toEqual({
      files: { a: "m" },
      conflicts: ["a"],
    });
  });

  it("follows a side that removed a file the other didn't touch", () => {
    expect(merged({ a: f("1") }, {}, { a: f("1") })).toEqual({ files: {}, conflicts: [] });
    expect(merged({ a: f("1") }, { a: f("1") }, {})).toEqual({ files: {}, conflicts: [] });
    expect(merged({ a: f("1") }, {}, {})).toEqual({ files: {}, conflicts: [] });
  });

  it("lists a conflict when one side removed a file the other changed, keeping the author's", () => {
    expect(merged({ a: f("1") }, {}, { a: f("t") })).toEqual({ files: {}, conflicts: ["a"] });
    expect(merged({ a: f("1") }, { a: f("m") }, {})).toEqual({
      files: { a: "m" },
      conflicts: ["a"],
    });
  });

  it("counts the executable bit and the encoding as content", () => {
    expect(merged({ a: f("1") }, { a: f("1", true) }, { a: f("1") }).files).toEqual({ a: "1" });
    const result = mergeFiles(
      files({ a: f("1") }),
      files({ a: f("1") }),
      files({ a: f("1", true) }),
    );
    expect(result.files.get("a")?.executable).toBe(true);
    expect(
      mergeFiles(
        files({ a: f("QQ==") }),
        files({ a: f("QQ==") }),
        files({ a: { ...f("QQ=="), encoding: "base64" } }),
      ).files.get("a")?.encoding,
    ).toBe("base64");
  });

  it("sorts the conflicts by path", () => {
    expect(
      merged({ b: f("1"), a: f("1") }, { b: f("m"), a: f("m") }, { b: f("t"), a: f("t") })
        .conflicts,
    ).toEqual(["a", "b"]);
  });
});
