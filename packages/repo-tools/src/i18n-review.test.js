import { describe, expect, it } from "vitest";
import { flatten, glossaryOf, rowsOf, toCsv, toMarkdown, websitePages } from "./i18n-review.js";

const trees = {
  en: { a: { b: "Create | now", c: "Line\ntwo" }, d: "Hi" },
  pt: { a: { b: "Criar | agora", c: "Linha\ndois" }, d: "Oi" },
  fr: { a: { b: "Créer", c: 'Dit "x"' } },
};

describe("the review export", () => {
  it("flattens a tree in file order", () => {
    expect(flatten(trees.en)).toEqual([
      ["a.b", "Create | now"],
      ["a.c", "Line\ntwo"],
      ["d", "Hi"],
    ]);
  });

  it("puts the three languages on one row, with the screen of the key", () => {
    expect(rowsOf(trees)[0]).toEqual({
      key: "a.b",
      screen: "a.b",
      en: "Create | now",
      pt: "Criar | agora",
      fr: "Créer",
    });
    expect(rowsOf(trees)[2]).toMatchObject({ key: "d", fr: "" });
  });

  it("writes a table a reader can open, and a CSV a spreadsheet can", () => {
    const rows = rowsOf(trees);
    const md = toMarkdown("demo", rows);
    expect(md).toContain("| `a.b` | Create \\| now | Criar \\| agora | Créer |");
    expect(md).toContain('| `a.c` | Line two | Linha dois | Dit "x" |');
    expect(toCsv(rows)).toContain('"a.c","a.c","Line\ntwo","Linha\ndois","Dit ""x"""');
  });

  it("is the same twice", () => {
    expect(toMarkdown("demo", rowsOf(trees))).toBe(toMarkdown("demo", rowsOf(trees)));
  });
});

describe("the glossary and the website's pages", () => {
  it("lifts the glossary table out of the notes", () => {
    const notes =
      "## Typography\n\nx\n\n## Glossary\n\nWords.\n\n| English | Português | Français |\n|---|---|---|\n| scope | escopo | portée |\n\nKept in English: Ronne.\n";
    expect(glossaryOf(notes)).toContain("| scope | escopo | portée |");
    expect(glossaryOf(notes)).not.toContain("Kept in English");
    expect(glossaryOf("nothing")).toContain("was not found");
  });

  it("lists every topic's page in both languages", () => {
    const text = websitePages([{ slug: "overview" }, { slug: "scopes" }]);
    expect(text).toContain(
      "| overview | https://www.ronne.ai/pt/marketplace/docs | https://www.ronne.ai/fr/marketplace/docs |",
    );
    expect(text).toContain("/fr/marketplace/docs/scopes |");
  });
});
