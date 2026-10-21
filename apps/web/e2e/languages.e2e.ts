import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 129: the screens speak the person's language. Before they choose one, the browser's
 * decides (`Accept-Language`, which Playwright's `locale` sets), English when it asks for
 * something the app doesn't speak.
 */
const signIn = async (page: Page) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.root);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
};

const CASES = [
  { locale: "en-US", lang: "en", heading: "Page not found", home: "Go to Home" },
  { locale: "pt-BR", lang: "pt", heading: "Página não encontrada", home: "Ir para o início" },
  { locale: "fr-CA", lang: "fr", heading: "Page introuvable", home: "Aller à l’accueil" },
  { locale: "es-ES", lang: "en", heading: "Page not found", home: "Go to Home" },
] as const;

for (const { locale, lang, heading, home } of CASES) {
  test.describe(`a browser asking for ${locale}`, () => {
    test.use({ locale });

    test(`gets the 404 page in ${lang}`, async ({ page }) => {
      await signIn(page);
      const response = await page.goto("/this-page-does-not-exist");
      expect(response?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByRole("link", { name: home })).toBeVisible();
    });
  });
}

test("a dialog's close button follows the language", async ({ browser }) => {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  await signIn(page);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: /^Create user/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Fechar" })).toBeVisible();
  await context.close();
});
