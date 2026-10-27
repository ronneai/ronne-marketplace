import { expect, type Page, test } from "@playwright/test";
import { loadAll, noEnglish } from "./no-english";
import { describeOverflow, measureOverflow, overflows } from "./sweep";

/**
 * Feature 132: the setup wizard shows in the browser's language, on an instance with no database
 * and no user yet (the wizard project's blank instance), before the English test installs it.
 * Its file name sorts before `setup-wizard.e2e.ts`, which sets the instance up.
 */
/**
 * The mobile sweep skips /setup (the wizard runs on instances of its own), so the wizard's phone
 * width is checked here, in each language, at each step (133): nothing may stick out at 320px.
 */
const fitsPhone = async (page: Page) => {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 700 });
  const overflow = await measureOverflow(page);
  expect(overflows(overflow) ? describeOverflow(overflow) : null, page.url()).toBeNull();
  if (size) await page.setViewportSize(size);
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
    await fitsPhone(page);
    // The steps of the wizard, one by one.
    await page.getByRole("button", { name: word("admin.setup.wizard.next") }).click();
    await expect(page.getByLabel(word("admin.setup.instance.publicUrl"))).toBeVisible();
    await noEnglish(page, lang);
    await fitsPhone(page);
    await page.getByRole("button", { name: word("admin.setup.wizard.next") }).click();
    await expect(page.getByLabel(word("admin.setup.root.again"))).toBeVisible();
    await noEnglish(page, lang);
    await fitsPhone(page);
    await context.close();
  });
}
