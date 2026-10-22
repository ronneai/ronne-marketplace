import { describe, expect, it } from "vitest";
import en from "../../messages/en/feedback.json";
import fr from "../../messages/fr/feedback.json";
import pt from "../../messages/pt/feedback.json";

/**
 * Feedback messages (feature 127): no Portuguese or French text is left identical to the
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

/**
 * Messages that read the same in some language: a word both share (`Question`, `Message`, `Feedback`,
 * `Version`), listed with the languages where it does.
 */
const SAME: Record<string, readonly string[]> = {
  "kind.question": ["fr"],
  "message.label": ["fr"],
  "admin.title": ["pt"],
  "admin.columns.version": ["fr"],
  "admin.columns.message": ["fr"],
  "admin.columns.page": ["fr"],
};

describe("the feedback messages are translated (127)", () => {
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
