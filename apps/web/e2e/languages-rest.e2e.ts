import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { noEnglish } from "./no-english";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 133: the screens 124–129 moved (Home, Account, Feedback, the phone menu, sign-in and the
 * device page) read in Portuguese and French with none of the English left over, by the same scan
 * as the other language specs. One user signs in once (docs/knowledge/e2e-sign-in-limit.md) and
 * the session opens in a browser per language.
 */
let session: Awaited<ReturnType<BrowserContext["storageState"]>>;

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.restLanguages);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  // One token, so Account › Tokens shows its table (a cell with a date and a status) to the scan.
  await page.goto("/account/tokens");
  await page.getByRole("button", { name: "Create token" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("e2e laptop");
  await dialog.getByRole("button", { name: "Create token" }).click();
  await expect(dialog.getByText("Copy it now")).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("cell", { name: "e2e laptop", exact: true })).toBeVisible();
  session = await context.storageState();
  await context.close();
});

const open = async (
  browser: Browser,
  baseURL: string | undefined,
  locale: string,
  signedIn = true,
) => {
  const context = await browser.newContext({
    baseURL,
    locale,
    ...(signedIn ? { storageState: session } : {}),
  });
  return { context, page: await context.newPage() };
};

const SIGNED_IN = [
  "/",
  "/account/security",
  "/account/tokens",
  "/account/password",
  "/account/language",
  "/feedback",
  "/menu",
  "/device",
];

for (const [locale, lang] of [
  ["pt-BR", "pt"],
  ["fr-CA", "fr"],
] as const) {
  test.describe(`in ${lang}`, () => {
    for (const path of SIGNED_IN) {
      test(`${path} has no English left`, async ({ browser, baseURL }) => {
        const { context, page } = await open(browser, baseURL, locale);
        await page.goto(path);
        await expect(page.locator("main, body").first()).toBeVisible();
        await noEnglish(page, lang);
        await context.close();
      });
    }

    test("sign-in has no English left", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, locale, false);
      await page.goto("/sign-in");
      await noEnglish(page, lang);
      await context.close();
    });
  });
}
