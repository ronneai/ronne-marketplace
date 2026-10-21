import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { E2E_NAMES, E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 129: the screens speak the person's language. Before they choose one, the browser's
 * decides (`Accept-Language`, which Playwright's `locale` sets), English when it asks for
 * something the app doesn't speak. The test signs in once, as its own user (the sign-in limit,
 * docs/knowledge/e2e-sign-in-limit.md), and opens the same session in a browser per language.
 */
let session: Awaited<ReturnType<BrowserContext["storageState"]>>;

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.languages);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  session = await context.storageState();
  await context.close();
});

const openAs = async (browser: Browser, baseURL: string | undefined, locale: string) => {
  const context = await browser.newContext({ baseURL, locale, storageState: session });
  return { context, page: await context.newPage() };
};

const CASES = [
  { locale: "en-US", lang: "en", heading: "Page not found", home: "Go to Home" },
  { locale: "pt-BR", lang: "pt", heading: "Página não encontrada", home: "Ir para o início" },
  { locale: "fr-CA", lang: "fr", heading: "Page introuvable", home: "Aller à l’accueil" },
  { locale: "es-ES", lang: "en", heading: "Page not found", home: "Go to Home" },
] as const;

for (const { locale, lang, heading, home } of CASES) {
  test(`a browser asking for ${locale} gets the 404 page in ${lang}`, async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await openAs(browser, baseURL, locale);
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("link", { name: home })).toBeVisible();
    await context.close();
  });
}

test("the sidebar, its groups and the account menu follow the language (Portuguese)", async ({
  browser,
  baseURL,
}) => {
  const { context, page } = await openAs(browser, baseURL, "pt-BR");
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
  await expect(sidebar).toBeVisible();
  const nav = sidebar.getByRole("navigation", { name: "Principal" });
  for (const name of ["Início", "Catálogo", "Espaços de trabalho", "Revisões", "Submissões"])
    await expect(nav.getByRole("link", { name })).toBeVisible();
  await expect(nav.getByText("Governança e revisões")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Recolher a barra lateral" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Propor item" })).toBeVisible();
  // The account menu is a <details>: opening it shows Account and Sign out.
  await sidebar.locator("summary", { hasText: E2E_NAMES.languages }).click({ timeout: 5000 });
  await expect(sidebar.getByRole("link", { name: "Conta" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Sair" })).toBeVisible();
  await context.close();
});

test("the same session in English keeps the English labels", async ({ browser, baseURL }) => {
  const { context, page } = await openAs(browser, baseURL, "en-US");
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  await expect(sidebar.getByRole("link", { name: "Catalogue" })).toBeVisible();
  await expect(sidebar.getByText("Governance & reviews")).toBeVisible();
  await context.close();
});
