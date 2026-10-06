import { describe, expect, it } from "vitest";
import { normalizeFrontmatter, parseFrontmatter, quoteItemNames } from "./frontmatter.js";

describe("parseFrontmatter", () => {
  it("splits the YAML block from the body", () => {
    expect(parseFrontmatter("---\nname: review\ndescription: Reviews.\n---\n# Hi\n")).toEqual({
      data: { name: "review", description: "Reviews." },
      yaml: "name: review\ndescription: Reviews.",
      body: "# Hi\n",
      error: null,
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
      expect(parseFrontmatter(text)).toEqual({ data: null, yaml: null, body: text, error: null });
  });

  it("keeps the block's text but no data when it isn't a YAML mapping", () => {
    expect(parseFrontmatter("---\n- a\n- b\n---\nBody")).toEqual({
      data: null,
      yaml: "- a\n- b",
      body: "Body",
      error: null,
    });
    expect(parseFrontmatter("---\nname: [unclosed\n---\nBody")).toMatchObject({
      data: null,
      yaml: "name: [unclosed",
    });
    // Aliases are refused, so a crafted block can't expand.
    expect(parseFrontmatter("---\na: &x 1\nb: *x\n---\n").data).toBeNull();
  });
});

describe("item names in frontmatter (097)", () => {
  it("reads an unquoted @scope/name as a string, after a key or a list's dash", () => {
    expect(
      parseFrontmatter("---\nname: a\nagent: @test/agent\nskills:\n  - @team/one # first\n---\n")
        .data,
    ).toEqual({ name: "a", agent: "@test/agent", skills: ["@team/one"] });
  });

  it("leaves quoted names, other values and partial names alone", () => {
    const yaml = 'agent: "@test/agent"\nnote: @team\nurl: a@b/c\nx: @Team/Bad\nkey: @a/b c';
    expect(quoteItemNames(yaml)).toBe(yaml);
    expect(quoteItemNames("agent:   @a/b  \r")).toBe('agent:   "@a/b"  \r');
  });

  it("quotes them in the file as a draft is saved, and changes nothing else", () => {
    const text = "---\nname: a\nagent: @test/agent\n---\nUse @test/agent.\n";
    expect(normalizeFrontmatter(text)).toBe(
      '---\nname: a\nagent: "@test/agent"\n---\nUse @test/agent.\n',
    );
    for (const same of ["# No block\n", '---\nagent: "@a/b"\n---\n'])
      expect(normalizeFrontmatter(same)).toBe(same);
  });

  it("says why a block doesn't parse, with its line in the file", () => {
    expect(parseFrontmatter("---\nname: a\nbad: [unclosed\n---\n").error).toMatchObject({
      line: expect.any(Number),
    });
    const { error } = parseFrontmatter("---\nname: a\nname: b\n---\n");
    expect(error?.message).toContain("unique");
    expect(error?.line).toBe(3);
  });

  it("knows a block by its indicators in either order, and by a quoted key with a #", () => {
    for (const header of ["d: |2-", "d: >1+", "d: |-2", "'d #': |", '"d": >'])
      expect(quoteItemNames(`${header}\n  k: @x/y\nagent: @a/b`)).toBe(
        `${header}\n  k: @x/y\nagent: "@a/b"`,
      );
  });

  it("leaves the lines of a | or > block alone, they're text", () => {
    const yaml =
      "description: |\n  - @a/b\n  agent: @c/d\n\n  more\nnotes: >-\n  agent: @e/f\nagent: @g/h";
    expect(quoteItemNames(yaml)).toBe(
      'description: |\n  - @a/b\n  agent: @c/d\n\n  more\nnotes: >-\n  agent: @e/f\nagent: "@g/h"',
    );
  });

  it("never reads $ in the frontmatter as a replacement pattern", () => {
    const text = "---\ndescription: costs $& and $' here\nagent: @a/b\n---\nBody $`\n";
    expect(normalizeFrontmatter(text)).toBe(
      '---\ndescription: costs $& and $\' here\nagent: "@a/b"\n---\nBody $`\n',
    );
    expect(normalizeFrontmatter("---\r\nagent: @a/b\r\n---\r\n")).toBe(
      '---\r\nagent: "@a/b"\r\n---\r\n',
    );
  });

  it("stays fast on long hostile lines (docs/knowledge/codeql-regex.md)", () => {
    const started = performance.now();
    for (const line of [
      `${" ".repeat(100_000)}x`,
      `${"a:".repeat(50_000)} @a/b`,
      `k: @${"a".repeat(100_000)}/b`,
      `k: @a/b${" ".repeat(100_000)}x`,
      `x: |${" ".repeat(100_000)}y`,
      `'${" #".repeat(50_000)}`,
      `${"a ".repeat(50_000)}: |`,
      `a${" ".repeat(100_000)}`,
      `'${"x".repeat(100_000)}`,
    ])
      quoteItemNames(line);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
