import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import allow from "./english-fragments.allow.json";

/**
 * Portuguese and French messages with English words left in them (feature 133). The "untranslated"
 * tests catch a message that equals the English one; this catches the half-translated ones, which
 * the leak guards of the screens miss. It looks for words that are English and nothing else
 * (never a Portuguese or French word), outside code, placeholders and the names of ICU options.
 * A hit is a decision: fix the message, or add it to `english-fragments.allow.json` with a reason.
 */
type Tree = { [key: string]: string | Tree };
const messagesDir = (locale: string) =>
  fileURLToPath(new URL(`../../messages/${locale}/`, import.meta.url));
const flat = (value: string | Tree, prefix = ""): [string, string][] =>
  typeof value === "string"
    ? [[prefix, value]]
    : Object.entries(value).flatMap(([key, child]) =>
        flat(child, prefix ? `${prefix}.${key}` : key),
      );
const load = (locale: string) =>
  readdirSync(messagesDir(locale))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .flatMap((file) => {
      const namespace = file.slice(0, -".json".length);
      const tree = JSON.parse(readFileSync(`${messagesDir(locale)}${file}`, "utf8")) as Tree;
      return flat(tree).map(([key, text]) => [`${namespace}:${key}`, text] as const);
    });

/** English words that are not Portuguese or French words, in any form. */
export const ENGLISH_WORDS = new Set(
  (
    "the and with without your you this that these those from was were has have had will " +
    "would should could can might may cannot because their there which while they been " +
    "after before between during about please click here is be does did then than when " +
    "where what who how why our its it we all any each both most just also very only " +
    "saved rejected failed profile dashboard loading successfully user users workspace workspaces settings password delete deleted create update updates submit " +
    "reset disable revoke rotate cancel reviewer reviewers"
  ).split(" "),
);

/** The words of a message that a person reads: no code, placeholders, tags, ICU option names or identifiers. */
export const readWords = (message: string): string[] => {
  const text = message
    .replace(/<(code|mono|name|kbd)>.*?<\/\1>/gs, " ")
    .replace(/\{[^{}]*,\s*(select|plural|selectordinal)\s*,/g, "{")
    .replace(/[\w=]+\s*\{/g, " {")
    .replace(/\{\s*\w+\s*(,\s*(number|date|time)[^{}]*)?\}/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\b[\w-]+(\.[\w-]+)+\b/g, " ")
    .replaceAll("’", "'");
  return text.match(/[A-Za-zÀ-ÿ']+/g) ?? [];
};
export const englishWordsIn = (message: string) =>
  readWords(message).filter((word) => ENGLISH_WORDS.has(word.toLowerCase()));

const allowed = allow as Record<string, Record<string, string>>;

describe("pt and fr messages hold no English words (133)", () => {
  for (const locale of ["pt", "fr"] as const) {
    it(`${locale}: every English word is on the reviewed list, with a reason`, () => {
      const found = load(locale)
        .map(([key, text]) => [key, englishWordsIn(text)] as const)
        .filter(([key, words]) => words.length > 0 && !allowed[locale]?.[key])
        .map(([key, words]) => `${key}: ${[...new Set(words)].join(", ")}`);
      expect(found).toEqual([]);
    });

    it(`${locale}: every allowed message still exists and still has the English`, () => {
      const messages = new Map<string, string>(load(locale));
      for (const [key, reason] of Object.entries(allowed[locale] ?? {})) {
        expect(reason.length, `${key} needs a reason`).toBeGreaterThan(10);
        const text = messages.get(key);
        expect(text, `${key} is gone`).toBeDefined();
        expect(
          englishWordsIn(text ?? "").length,
          `${key} no longer needs the allowance`,
        ).toBeGreaterThan(0);
      }
    });
  }

  it("sees English in a half-translated message, and not in Portuguese or French that looks like it", () => {
    expect(englishWordsIn("Crie a conta with your email")).toEqual(["with", "your"]);
    expect(englishWordsIn("Excluir user permanentemente")).toEqual(["user"]);
    expect(englishWordsIn("Votre token expire, cliquez")).toEqual([]);
    expect(englishWordsIn("{n, plural, one {# item} other {# itens}} para a conta")).toEqual([]);
    expect(englishWordsIn("Elle a l’air de ne pas être là, on en a pour une heure")).toEqual([]);
    expect(
      englishWordsIn("Execute <code>rmk login the</code> e abra {name} em tool.after"),
    ).toEqual([]);
    expect(englishWordsIn("{from, select, a {the b} other {c}}")).toEqual(["the"]);
  });
});
