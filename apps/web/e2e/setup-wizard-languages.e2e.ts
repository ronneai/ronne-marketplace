import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Feature 132: the setup wizard shows in the browser's language, on an instance with no database
 * and no user yet (the wizard project's blank instance), before the English test installs it.
 * Its file name sorts before `setup-wizard.e2e.ts`, which sets the instance up.
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
const loadAll = (locale: string) => {
  const all: Record<string, string> = {};
  for (const namespace of ["admin", "common", "help"])
    Object.assign(
      all,
      flat(
        JSON.parse(readFileSync(join(MESSAGES, locale, `${namespace}.json`), "utf8")),
        namespace,
      ),
    );
  return all;
};

const noEnglish = async (page: Page, lang: "pt" | "fr") => {
  const english = loadAll("en");
  const own = loadAll(lang);
  const ownTexts = new Set(Object.values(own));
  await page.evaluate(() => {
    for (const details of document.querySelectorAll("details")) details.open = true;
  });
  const lines = new Set(
    (await page.locator("body").innerText())
      .split(/[\n\t]/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const leaks = Object.entries(english)
    .filter(([key, text]) => text.length >= 4 && !/[{<]/.test(text) && text !== own[key])
    .filter(([, text]) => !ownTexts.has(text))
    .filter(([, text]) => lines.has(text))
    .map(([key]) => key);
  expect(leaks, `English left on ${page.url()}`).toEqual([]);
};

for (const [locale, lang] of [
  ["pt-BR", "pt"],
  ["fr-CA", "fr"],
] as const) {
  test(`the wizard reads in ${lang}, from the browser's language`, async ({ browser, baseURL }) => {
    const all = loadAll(lang);
    const word = (key: string) => {
      const text = all[key];
      if (!text) throw new Error(`No message ${key} in ${lang}`);
      return text;
    };
    const context = await browser.newContext({ baseURL, locale });
    const page = await context.newPage();
    // Every page ends on the setup until it is ready.
    await page.goto("/");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(
      page.getByRole("heading", { name: word("admin.setup.page.title"), level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(word("admin.setup.page.warnTitle"))).toBeVisible();
    await expect(
      page.getByRole("button", { name: word("admin.setup.wizard.testConnection") }),
    ).toBeVisible();
    await noEnglish(page, lang);
    // The steps of the wizard, one by one.
    await page.getByRole("button", { name: word("admin.setup.wizard.next") }).click();
    await expect(page.getByLabel(word("admin.setup.instance.publicUrl"))).toBeVisible();
    await noEnglish(page, lang);
    await page.getByRole("button", { name: word("admin.setup.wizard.next") }).click();
    await expect(page.getByLabel(word("admin.setup.root.again"))).toBeVisible();
    await noEnglish(page, lang);
    await context.close();
  });
}
