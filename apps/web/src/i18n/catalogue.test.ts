import { describe, expect, it } from "vitest";
import {
  type Catalogue,
  compareCatalogues,
  extraKeys,
  flatten,
  mergeWithFallback,
  missingKeys,
  placeholders,
} from "./catalogue";

const en: Catalogue = {
  language: { label: "Language", automatic: "Automatic" },
  items: "{count, plural, one {# item} other {# items}}",
  hello: "Hello, {name}!",
};

describe("flatten (129)", () => {
  it("turns nesting into dotted keys", () => {
    expect(flatten(en)).toEqual({
      "language.label": "Language",
      "language.automatic": "Automatic",
      items: "{count, plural, one {# item} other {# items}}",
      hello: "Hello, {name}!",
    });
  });
});

describe("missingKeys and extraKeys (129)", () => {
  it("lists what a language lacks or leaves empty, and what it adds", () => {
    const pt: Catalogue = {
      language: { label: "Idioma", automatic: "" },
      hello: "Olá, {name}!",
      more: "x",
    };
    expect(missingKeys(en, pt)).toEqual(["language.automatic", "items"]);
    expect(extraKeys(en, pt)).toEqual(["more"]);
  });
});

describe("mergeWithFallback (129)", () => {
  it("shows the language's text where it has some, and English where it doesn't", () => {
    const pt: Catalogue = { language: { label: "Idioma" }, hello: "Olá, {name}!" };
    expect(mergeWithFallback(en, pt)).toEqual({
      language: { label: "Idioma", automatic: "Automatic" },
      items: "{count, plural, one {# item} other {# items}}",
      hello: "Olá, {name}!",
    });
  });

  it("treats an empty text, a missing group and a wrong shape as missing", () => {
    expect(mergeWithFallback(en, { language: "oops", hello: "" } as Catalogue)).toEqual(en);
    expect(mergeWithFallback(en, {})).toEqual(en);
  });

  it("drops keys English doesn't have", () => {
    expect(mergeWithFallback({ a: "A" }, { a: "a", extra: "x" })).toEqual({ a: "a" });
  });
});

describe("placeholders (129)", () => {
  it("lists what a message asks of its caller, sorted", () => {
    expect(placeholders("Plain text")).toEqual([]);
    expect(placeholders("Hello, {name}! {count}")).toEqual(["count:value", "name:value"]);
    expect(placeholders("{n, number} on {d, date} at {t, time}")).toEqual([
      "d:date",
      "n:number",
      "t:time",
    ]);
  });

  it("looks inside plurals, selects and tags", () => {
    expect(placeholders("{count, plural, one {# item by {who}} other {# items}}")).toEqual([
      "count:plural",
      "who:value",
    ]);
    expect(placeholders("{role, select, root {Root} other {{name}}}")).toEqual([
      "name:value",
      "role:select",
    ]);
    expect(placeholders("Read <b>{what}</b> first")).toEqual(["b:tag", "what:value"]);
  });

  it("ignores plural categories, which differ by language", () => {
    expect(
      placeholders("{n, plural, one {# fichier} many {# de fichiers} other {# fichiers}}"),
    ).toEqual(placeholders("{n, plural, one {# file} other {# files}}"));
  });

  it("doesn't count quoted braces", () => {
    expect(placeholders("Use '{braces}' like this")).toEqual([]);
  });

  it("throws on invalid ICU and on a plural without other", () => {
    expect(() => placeholders("Hello, {name")).toThrow();
    expect(() => placeholders("{n, plural, one {# file}}")).toThrow();
  });
});

describe("compareCatalogues (129)", () => {
  it("finds nothing when a language agrees with English", () => {
    const fr: Catalogue = {
      language: { label: "Langue", automatic: "Automatique" },
      items: "{count, plural, one {# élément} many {# d’éléments} other {# éléments}}",
      hello: "Bonjour, {name} !",
    };
    expect(compareCatalogues(en, fr)).toEqual([]);
  });

  it("fails on a key missing in the language", () => {
    const pt: Catalogue = {
      language: { label: "Idioma" },
      items: en.items as string,
      hello: "Olá, {name}!",
    };
    expect(compareCatalogues(en, pt)).toEqual([{ kind: "missing", key: "language.automatic" }]);
  });

  it("fails on a key English doesn't have", () => {
    expect(compareCatalogues({ a: "A" }, { a: "a", b: "b" })).toEqual([
      { kind: "extra", key: "b" },
    ]);
  });

  it("fails on a placeholder that was renamed, dropped or added", () => {
    const issues = compareCatalogues(
      { a: "Hi {name}", b: "Hi {name}", c: "Hi" },
      { a: "Oi {nome}", b: "Oi", c: "Oi {who}" },
    );
    expect(issues.map((i) => [i.kind, i.key])).toEqual([
      ["placeholders", "a"],
      ["placeholders", "b"],
      ["placeholders", "c"],
    ]);
  });

  it("fails on a plural that became a plain value, and on invalid ICU", () => {
    const issues = compareCatalogues(
      { a: "{n, plural, one {# a} other {# b}}", b: "x" },
      { a: "{n} coisas", b: "{oops" },
    );
    expect(issues.map((i) => [i.kind, i.key])).toEqual([
      ["placeholders", "a"],
      ["invalid", "b"],
    ]);
  });
});
