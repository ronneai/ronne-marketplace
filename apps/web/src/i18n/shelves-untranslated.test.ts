import { describe, expect, it } from "vitest";
import en from "../../messages/en/shelves.json";
import fr from "../../messages/fr/shelves.json";
import pt from "../../messages/pt/shelves.json";

/**
 * Pins and favorites messages (feature 125): no Portuguese or French text is left identical to the
 * English one. The leak guards of the screens skip a text that is the same in both languages, so
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

/** Messages that read the same in every language. None yet. */
const SAME: string[] = [];

describe("the shelves messages are translated (125)", () => {
  for (const [name, own] of [
    ["pt", pt],
    ["fr", fr],
  ] as const) {
    it(`${name}: no message is the English one`, () => {
      const english = flat(en);
      const mine = flat(own);
      const same = Object.keys(english).filter((key) => english[key] === mine[key]);
      expect(same.filter((key) => !SAME.includes(key))).toEqual([]);
    });
  }
});
