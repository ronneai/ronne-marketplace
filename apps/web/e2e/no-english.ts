import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

/**
 * The English-leak scan the language specs share (feature 129–133): after a page is opened in
 * Portuguese or French, no plain English message of the app may stand on a line of its own.
 *
 * The page text is split on newlines **and tabs**: a table row is tab-joined, so a header or a
 * cell is a line of its own only when both split it (132 found English hiding in a table).
 */
const MESSAGES = join(import.meta.dirname, "../messages");

const flat = (value: unknown, prefix = ""): Record<string, string> =>
  typeof value === "string"
    ? { [prefix]: value }
    : Object.assign(
        {},
        ...Object.entries(value as object).map(([key, child]) =>
          flat(child, prefix ? `${prefix}.${key}` : key),
        ),
      );

/** Every message of a language, flattened: `catalogue.view.filters.button` → "Filters". */
export const loadAll = (locale: string): Record<string, string> => {
  const all: Record<string, string> = {};
  for (const file of readdirSync(join(MESSAGES, locale)).filter((name) => name.endsWith(".json"))) {
    const namespace = file.slice(0, -".json".length);
    Object.assign(
      all,
      flat(JSON.parse(readFileSync(join(MESSAGES, locale, file), "utf8")), namespace),
    );
  }
  return all;
};

/** The lines of text a page shows (closed panels opened first), each trimmed. */
export const pageLines = async (page: Page): Promise<Set<string>> => {
  // Closed panels (Filters, Sort, a table's actions) are not in `innerText`: open them all first.
  await page.evaluate(() => {
    for (const details of document.querySelectorAll("details")) details.open = true;
  });
  return new Set(
    (await page.locator("body").innerText())
      .split(/[\n\t]/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
};

/** The keys of English messages that stand on a line of their own in `lines`. */
export const englishKeysIn = (
  lines: ReadonlySet<string>,
  lang: "pt" | "fr",
  except: readonly string[] = [],
) => {
  const english = loadAll("en");
  const own = loadAll(lang);
  // A word the language also writes as the English does (a type name, Admin) is not a leak.
  const ownTexts = new Set(Object.values(own));
  return Object.entries(english)
    .filter(([key, text]) => text.length >= 4 && !/[{<]/.test(text) && text !== own[key])
    .filter(([key, text]) => !ownTexts.has(text) && !except.includes(key))
    .filter(([, text]) => lines.has(text))
    .map(([key]) => key);
};

/**
 * No English left: every plain English message (no placeholder or tag, four characters or more)
 * that reads differently in the language must not stand on a line of its own on the page. Item
 * content, names and what people write are not messages, so they never match.
 */
export const noEnglish = async (page: Page, lang: "pt" | "fr", except: readonly string[] = []) => {
  expect(
    englishKeysIn(await pageLines(page), lang, except),
    `English left on ${page.url()}`,
  ).toEqual([]);
};
