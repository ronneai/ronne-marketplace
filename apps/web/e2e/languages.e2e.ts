import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
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

test.describe("choosing a language", () => {
  const signInAs = async (page: Page, email: string) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/$/);
  };

  test("Account › Language saves it, the screens change at once, and Automatic goes back", async ({
    page,
  }) => {
    await signInAs(page, E2E_USERS.languageChooser);
    await page.goto("/account/language");
    await expect(page.getByRole("heading", { name: "Language", level: 2 })).toBeVisible();
    // Every language is named in its own words.
    const select = page.getByLabel("Language of the screens");
    await expect(select.locator("option")).toHaveText([
      "Automatic (the browser's language)",
      "English",
      "Português",
      "Français",
    ]);

    await select.selectOption("pt");
    await page.getByRole("button", { name: "Save" }).click();
    // The same page, in the new language, with the confirmation.
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    await expect(page.getByText("Idioma salvo")).toBeVisible();
    const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
    await expect(sidebar.getByRole("link", { name: "Catálogo" })).toBeVisible();
    await expect(page.getByLabel("Idioma das telas")).toHaveValue("pt");
    expect((await page.context().cookies()).find((c) => c.name === "ronne-locale")?.value).toBe(
      "pt",
    );

    // It is on the profile: a reload, and another page, keep it.
    await page.goto("/account/password");
    await expect(page.getByRole("heading", { name: "Alterar senha" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");

    // French, then Automatic: the browser (English here) decides again.
    await page.goto("/account/language");
    await page.getByLabel("Idioma das telas").selectOption("fr");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByText("Langue enregistrée")).toBeVisible();
    await page.getByLabel("Langue des écrans").selectOption("");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByText("follow your browser's language")).toBeVisible();
    expect((await page.context().cookies()).find((c) => c.name === "ronne-locale")).toBeUndefined();
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the form still saves it", async ({ page }) => {
      await signInAs(page, E2E_USERS.languageNoJs);
      await page.goto("/account/language");
      await page.getByLabel("Language of the screens").selectOption("fr");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.getByRole("complementary", { name: "Barre latérale" })).toBeVisible();
    });
  });
});

test.describe("the language links on the sign-in page", () => {
  test("a visitor picks a language before signing in, and keeps it after", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { name: "Sign in to Ronne AI Marketplace" }),
    ).toBeVisible();
    const links = page.getByRole("navigation", { name: "Language" });
    // A menu: it shows the language in use, and opens to the list.
    await expect(links.getByRole("group")).toBeVisible();
    await links.locator("summary").click();
    await expect(links.getByRole("link")).toHaveText(["English", "Português", "Français"]);
    await expect(links.getByRole("link", { name: "English" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await links.getByRole("link", { name: "Français" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByRole("heading", { name: "Connexion à Ronne AI Marketplace" }),
    ).toBeVisible();
    // A wrong password is refused in French.
    await page.getByLabel("Courriel").fill(E2E_USERS.languageSwitcher);
    await page.getByLabel("Mot de passe", { exact: true }).fill("not the password at all");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Le courriel ou le mot de passe est incorrect")).toBeVisible();

    // Signing in: no language is saved yet, so the cookie's still decides.
    await page.getByLabel("Mot de passe", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("complementary", { name: "Barre latérale" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });

  test("a saved language wins over the links on the page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(E2E_USERS.languageSaved);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/account/language");
    await page.getByLabel("Language of the screens").selectOption("pt");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Idioma salvo")).toBeVisible();

    // Signed out, the sign-in page follows the cookie the Save left: Portuguese.
    const sidebar = page.getByRole("complementary", { name: "Barra lateral" });
    await sidebar.locator("summary", { hasText: E2E_NAMES.languageSaved }).click();
    await sidebar.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(
      page.getByRole("heading", { name: "Entrar no Ronne AI Marketplace" }),
    ).toBeVisible();

    // Pick French on the page, then sign in: the profile's Portuguese beats the cookie's French.
    const menu = page.getByRole("navigation", { name: "Idioma" });
    await menu.locator("summary").click();
    await menu.getByRole("link", { name: "Français" }).click();
    await expect(
      page.getByRole("heading", { name: "Connexion à Ronne AI Marketplace" }),
    ).toBeVisible();
    await page.getByLabel("Courriel").fill(E2E_USERS.languageSaved);
    await page.getByLabel("Mot de passe", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    await expect(page.getByRole("complementary", { name: "Barra lateral" })).toBeVisible();
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the links still change the language", async ({ page }) => {
      await page.goto("/sign-in?next=%2Fitems");
      // The menu is a native <details>: it opens without JavaScript.
      await page.getByRole("navigation", { name: "Language" }).locator("summary").click();
      await page.getByRole("link", { name: "Português" }).click();
      await expect(page).toHaveURL(/\/sign-in\?next=%2Fitems$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt");
      await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    });
  });
});
