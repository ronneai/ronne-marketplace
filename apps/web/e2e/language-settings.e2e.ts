import { type Browser, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 141: root decides the language of the screens. With choosing off and French as the default,
 * everyone sees French and the ways to choose are gone: the sign-in page's language links and
 * Account › Language. With choosing on and English and French offered, a browser asking for
 * Portuguese gets the default, and the sign-in page offers only those two. The test sets the
 * instance and always puts it back (the run is one worker, so nothing else reads it meanwhile). It
 * is language-independent where the page speaks French: it finds the form by its ids.
 */
const signIn = async (page: Page) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.languageSettingsRoot);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const setLanguages = async (
  page: Page,
  settings: { default: "en" | "pt" | "fr"; choice: boolean; offered: ("en" | "pt" | "fr")[] },
) => {
  await page.goto("/admin/settings?tab=languages");
  await page.locator("#language-default").selectOption(settings.default);
  const choice = page.locator("#language-choice");
  if (settings.choice) await choice.check();
  else await choice.uncheck();
  for (const locale of ["en", "pt", "fr"] as const) {
    const box = page.locator(`input[name="offered"][value="${locale}"][type="checkbox"]`);
    if (locale === settings.default) continue;
    if (settings.offered.includes(locale)) await box.check();
    else await box.uncheck();
  }
  await page.getByRole("button", { name: /^(Save|Enregistrer|Salvar)$/ }).click();
  await expect(page.locator("[data-toast-kind=ok]")).toBeVisible();
};

const signedOut = async (browser: Browser, baseURL: string | undefined, locale: string) => {
  const context = await browser.newContext({ baseURL, locale });
  const page = await context.newPage();
  await page.goto("/sign-in");
  return { context, page };
};

test("choosing off with French as the default, then choosing on with two languages", async ({
  browser,
  baseURL,
  page,
}) => {
  await signIn(page);
  try {
    // Choosing off: French for everyone, and no way to choose.
    await setLanguages(page, { default: "fr", choice: false, offered: ["en", "pt", "fr"] });
    await page.goto("/account/password");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("link", { name: "Langue", exact: true })).toHaveCount(0);
    expect((await page.goto("/account/language"))?.status()).toBe(404);

    // A browser asking for Portuguese, signed out: French, with no language links.
    const off = await signedOut(browser, baseURL, "pt-BR");
    await expect(off.page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(off.page.locator('a[href^="/language"]')).toHaveCount(0);
    await expect(off.page.getByRole("navigation", { name: "Langue" })).toHaveCount(0);
    await off.context.close();

    // Choosing on with English and French offered: Portuguese is not offered, so the default.
    await setLanguages(page, { default: "fr", choice: true, offered: ["en", "fr"] });
    const portuguese = await signedOut(browser, baseURL, "pt-BR");
    await expect(portuguese.page.locator("html")).toHaveAttribute("lang", "fr");
    await portuguese.page.getByRole("navigation").locator("summary").click();
    const links = portuguese.page.locator('a[href^="/language"]');
    await expect(links).toHaveCount(2);
    await expect(links.filter({ hasText: "English" })).toHaveCount(1);
    await expect(links.filter({ hasText: "Português" })).toHaveCount(0);
    await portuguese.context.close();

    // A browser asking for English gets English; Account has its Language tab again.
    const english = await signedOut(browser, baseURL, "en-US");
    await expect(english.page.locator("html")).toHaveAttribute("lang", "en");
    await english.context.close();
    await page.goto("/account/password");
    expect((await page.goto("/account/language"))?.status()).toBe(200);
    await expect(page.locator("#language option")).toHaveCount(3);
  } finally {
    await setLanguages(page, { default: "en", choice: true, offered: ["en", "pt", "fr"] });
  }
  await page.goto("/account/password");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
