import { describe, expect, it } from "vitest";
import { DIFF_MAX_LINES, diffRevisions } from "./diff";
import type { RevisionFile } from "./review";

const text = (path: string, content: string, executable = false): RevisionFile => ({
  path,
  encoding: "utf8",
  content,
  size: content.length,
  executable,
});
const binary = (path: string, content: string): RevisionFile => ({
  path,
  encoding: "base64",
  content,
  size: 3,
  executable: false,
});

describe("diffRevisions", () => {
  it("lists every file as added when there's nothing to compare with", () => {
    const changes = diffRevisions(null, [text("ronne.yaml", "name: x\n"), text("rule.md", "Hi\n")]);
    expect(changes.map((c) => [c.path, c.status])).toEqual([
      ["ronne.yaml", "added"],
      ["rule.md", "added"],
    ]);
    expect(changes[1]?.hunks).toEqual([{ lines: [{ kind: "added", text: "Hi", after: 1 }] }]);
  });

  it("shows changed lines with context and line numbers, and skips unchanged files", () => {
    const before = [text("a.md", "one\ntwo\nthree\n"), text("same.md", "same\n")];
    const after = [text("a.md", "one\n2\nthree\nfour\n"), text("same.md", "same\n")];
    const [change] = diffRevisions(before, after);
    expect(diffRevisions(before, after)).toHaveLength(1);
    expect(change).toMatchObject({ path: "a.md", status: "changed", binary: false });
    expect(change?.hunks).toEqual([
      {
        lines: [
          { kind: "context", text: "one", before: 1, after: 1 },
          { kind: "removed", text: "two", before: 2 },
          { kind: "added", text: "2", after: 2 },
          { kind: "context", text: "three", before: 3, after: 3 },
          { kind: "added", text: "four", after: 4 },
        ],
      },
    ]);
  });

  it("lists removed files, binary changes without lines, and executable flag changes", () => {
    const changes = diffRevisions(
      [text("gone.md", "bye\n"), binary("logo.png", "AAAA"), text("run.sh", "echo\n")],
      [binary("logo.png", "BBBB"), text("run.sh", "echo\n", true)],
    );
    expect(changes).toEqual([
      expect.objectContaining({ path: "gone.md", status: "removed" }),
      expect.objectContaining({
        path: "logo.png",
        status: "changed",
        binary: true,
        hunks: undefined,
      }),
      expect.objectContaining({
        path: "run.sh",
        status: "changed",
        executableChanged: true,
        hunks: [],
      }),
    ]);
  });

  it("doesn't diff a file that's too large", () => {
    const big = Array.from({ length: DIFF_MAX_LINES + 1 }, (_, i) => `line ${i}`).join("\n");
    const [change] = diffRevisions([text("big.txt", big)], [text("big.txt", `${big}\nmore`)]);
    expect(change?.hunks).toBe("too_large");
  });
});
