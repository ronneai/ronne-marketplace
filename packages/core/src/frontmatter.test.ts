import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("splits the YAML block from the body", () => {
    expect(parseFrontmatter("---\nname: review\ndescription: Reviews.\n---\n# Hi\n")).toEqual({
      data: { name: "review", description: "Reviews." },
      yaml: "name: review\ndescription: Reviews.",
      body: "# Hi\n",
    });
  });

  it("reads CRLF line endings and a block at the very end", () => {
    expect(parseFrontmatter("---\r\nname: a\r\n---\r\nBody")).toMatchObject({
      data: { name: "a" },
      body: "Body",
    });
    expect(parseFrontmatter("---\nname: a\n---")).toMatchObject({ data: { name: "a" }, body: "" });
  });

  it("gives the whole text as the body when there's no block", () => {
    for (const text of ["# Title\n", "", "--- \nname: a\n---\n", "\n---\nname: a\n---\n"])
      expect(parseFrontmatter(text)).toEqual({ data: null, yaml: null, body: text });
  });

  it("keeps the block's text but no data when it isn't a YAML mapping", () => {
    expect(parseFrontmatter("---\n- a\n- b\n---\nBody")).toEqual({
      data: null,
      yaml: "- a\n- b",
      body: "Body",
    });
    expect(parseFrontmatter("---\nname: [unclosed\n---\nBody")).toMatchObject({
      data: null,
      yaml: "name: [unclosed",
    });
    // Aliases are refused, so a crafted block can't expand.
    expect(parseFrontmatter("---\na: &x 1\nb: *x\n---\n").data).toBeNull();
  });
});
