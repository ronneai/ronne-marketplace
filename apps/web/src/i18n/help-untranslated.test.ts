import { describe, expect, it } from "vitest";
import en from "../../messages/en/help.json";
import fr from "../../messages/fr/help.json";
import pt from "../../messages/pt/help.json";

/**
 * Help messages (feature 132): no Portuguese or French text is left identical to the English
 * one. The leak guards of the screens skip a text that is short or the same in both languages, so
 * this is what catches a message copied across untranslated.
 */
type Tree = { [key: string]: string | Tree };
const flat = (value: string | Tree, prefix = ""): Record<string, string> =>
  typeof value === "string"
    ? { [prefix]: value }
    : Object.assign(
        {},
        ...Object.entries(value).map(([key, child]) =>
          flat(child, prefix ? `${prefix}.${key}` : key),
        ),
      );

/**
 * Messages that read the same in some language: a word both share, listed with the languages
 * where it does, so a new one is a decision made here.
 */
const SAME: Record<string, readonly string[]> = {};

describe("the help messages are translated (132)", () => {
  for (const [name, own] of [
    ["pt", pt],
    ["fr", fr],
  ] as const) {
    it(`${name}: no message is the English one`, () => {
      const english = flat(en);
      const mine = flat(own);
      const same = Object.keys(english).filter((key) => english[key] === mine[key]);
      expect(same.filter((key) => !SAME[key]?.includes(name))).toEqual([]);
    });
  }
});
