import type { ManifestIssue } from "@ronneai/core";
import { describe, expect, it } from "vitest";
import { AS_OF_SAVE, editorProblems, savedOnly } from "./issues";

const range: ManifestIssue = {
  severity: "error",
  code: "dependency_range",
  message: "No published version of @team/db matches ^9.0.0.",
  path: "/dependencies",
  file: "ronne.yaml",
};
const schema: ManifestIssue = { severity: "error", code: "schema", message: "Hi.", path: "/x" };

describe("the registry's issues next to 011's (#142)", () => {
  it("keeps the registry's, less those the live checks already list, each once", () => {
    expect(savedOnly([schema], [range])).toEqual([range]);
    expect(savedOnly([schema, range], [range])).toEqual([]);
    expect(savedOnly([], [range, { ...range }])).toEqual([range]);
    // The same code about another file is another problem.
    expect(savedOnly([range], [{ ...range, file: "SKILL.md" }])).toHaveLength(1);
    expect(savedOnly([schema], [])).toEqual([]);
  });
});

describe("what the editor shows (#142)", () => {
  const missing: ManifestIssue = { ...range, code: "x", message: "No SKILL.md.", file: "SKILL.md" };
  const paths = ["prompt.md", "ronne.yaml"];

  it("counts both, files each under its file or ronne.yaml, and marks nothing when saved", () => {
    const shown = editorProblems([schema], [range, missing, schema], {
      paths,
      dirty: false,
      readOnly: false,
    });
    expect(shown.all).toEqual([schema, range, missing]);
    expect(shown.byFile.get("ronne.yaml")).toEqual({ live: [schema], saved: [range, missing] });
    expect(shown.byFile.has("SKILL.md")).toBe(false);
    expect(shown.savedLabel).toBeUndefined();
  });

  it("marks the registry's as of the last save while there are unsaved changes", () => {
    expect(editorProblems([], [range], { paths, dirty: true, readOnly: false }).savedLabel).toBe(
      AS_OF_SAVE,
    );
    expect(AS_OF_SAVE).toMatch(/^As of your last save/);
    // Nothing to mark, or nothing to edit.
    expect(editorProblems([schema], [], { paths, dirty: true, readOnly: false }).savedLabel).toBe(
      undefined,
    );
    expect(editorProblems([], [range], { paths, dirty: true, readOnly: true }).savedLabel).toBe(
      undefined,
    );
  });

  it("shows No problems for a clean draft", () => {
    const shown = editorProblems([], [], { paths, dirty: true, readOnly: false });
    expect(shown.all).toEqual([]);
    expect(shown.byFile.size).toBe(0);
  });
});
