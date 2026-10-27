import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_SKILL, E2E_USAGE_PEAK, E2E_USERS } from "./users";

/**
 * Feature 130: the screens people use to find and read items speak their language: the Catalogue,
 * an item's page, and the Workspaces pages, in Portuguese and French, with none of the English
 * left over. One user of its own signs in once (the sign-in limit,
 * docs/knowledge/e2e-sign-in-limit.md) and the same session opens in a browser per language.
 */
let session: Awaited<ReturnType<BrowserContext["storageState"]>>;

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.browseLanguages);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  session = await context.storageState();
  await context.close();
});

const open = async (browser: Browser, baseURL: string | undefined, locale: string) => {
  const context = await browser.newContext({ baseURL, locale, storageState: session });
  return { context, page: await context.newPage() };
};

type Words = {
  locale: string;
  lang: "pt" | "fr";
  filters: string;
  search: string;
  installs: RegExp;
  overview: string;
  dependencies: string;
  usage: string;
  install: string;
  propose: string;
  howInstall: string;
  workspaces: string;
  everyone: string;
  allWorkspaces: string;
  scopes: string;
  joined: string;
  /** The star on a card or an item page (125), and the Pin menu button. */
  star: RegExp;
  pin: string;
  pinDone: string;
};

const LANGUAGES: Words[] = [
  {
    locale: "pt-BR",
    lang: "pt",
    filters: "Filtros",
    search: "Pesquisar",
    installs: /\d+ instalaç(ão|ões)/,
    overview: "Visão geral",
    dependencies: "Dependências",
    usage: "Uso, últimos 14 dias",
    install: "Instalar",
    propose: "Propor uma alteração",
    howInstall: "Como instalo?",
    workspaces: "Espaços de trabalho",
    everyone: "Todos",
    allWorkspaces: "Todos os espaços de trabalho",
    scopes: "Escopos",
    joined: "Você já está neste espaço de trabalho.",
    star: /^Adicionar .+ aos favoritos$/,
    pin: "Fixar",
    pinDone: "Concluído",
  },
  {
    locale: "fr-CA",
    lang: "fr",
    filters: "Filtres",
    search: "Rechercher",
    installs: /\d+ installations?/,
    overview: "Aperçu",
    dependencies: "Dépendances",
    usage: "Utilisation, 14 derniers jours",
    install: "Installer",
    propose: "Proposer une modification",
    howInstall: "Comment l’installer?",
    workspaces: "Espaces de travail",
    everyone: "Tout le monde",
    allWorkspaces: "Tous les espaces de travail",
    scopes: "Portées",
    joined: "Vous êtes déjà dans cet espace de travail.",
    star: /^Ajouter .+ aux favoris$/,
    pin: "Épingler",
    pinDone: "Terminé",
  },
];

/** The message files, flattened: `catalogue.view.filters.button` → "Filters". */
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
const NAMESPACES = [
  "catalogue",
  "item",
  "workspaces",
  "types",
  "common",
  "shell",
  "help",
  "shelves",
];
const loadAll = (locale: string) => {
  const all: Record<string, string> = {};
  for (const namespace of NAMESPACES)
    Object.assign(
      all,
      flat(
        JSON.parse(readFileSync(join(MESSAGES, locale, `${namespace}.json`), "utf8")),
        namespace,
      ),
    );
  return all;
};

/** A message whose English is also a seeded item's keyword, which the cards show as written. */
const KEYWORD_AS_TAG = ["types.tag.permission-policy"];

/**
 * No English left: every plain English text of these screens (a message with no placeholder or tag,
 * four characters or more) that reads differently in the language must not stand on a line of its
 * own on the page. Item content, names and what people write are not messages, so they never match.
 */
const noEnglish = async (page: Page, lang: "pt" | "fr", except: readonly string[] = []) => {
  const english = loadAll("en");
  const own = loadAll(lang);
  const ownTexts = new Set(Object.values(own));
  // Closed panels (Filters, Sort, a table's actions) are not in `innerText`: open them all first.
  await page.evaluate(() => {
    for (const details of document.querySelectorAll("details")) details.open = true;
  });
  const lines = new Set(
    (await page.locator("body").innerText())
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const leaks = Object.entries(english)
    .filter(([key, text]) => text.length >= 4 && !/[{<]/.test(text) && text !== own[key])
    // A word the language also writes as the English does (a type name, Admin) is not a leak.
    .filter(([, text]) => !ownTexts.has(text))
    .filter(([key, text]) => lines.has(text) && !except.includes(key))
    .map(([key]) => key);
  expect(leaks, `English left on ${page.url()}`).toEqual([]);
};

for (const words of LANGUAGES) {
  test.describe(`in ${words.lang}`, () => {
    test("the Catalogue: search, filters, sort and the cards", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, words.locale);
      await page.goto("/catalogue?q=security");
      await expect(page.locator("html")).toHaveAttribute("lang", words.lang);
      await expect(page.locator("summary", { hasText: words.filters })).toBeVisible();
      await expect(page.getByRole("button", { name: words.search, exact: true })).toBeVisible();
      const card = page.getByRole("article").filter({ hasText: E2E_SKILL }).first();
      await expect(card).toBeVisible();
      await expect(card.getByText(words.installs)).toBeVisible();
      await expect(card.getByRole("button", { name: words.star })).toBeVisible();
      // The seeded skill's keyword "security" is data; it reads as permission-policy's tag (131).
      await noEnglish(page, words.lang, KEYWORD_AS_TAG);
      await context.close();
    });

    test("an item's page: tabs, install, usage with its peak, and Propose", async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await open(browser, baseURL, words.locale);
      await page.goto(`/items/${E2E_SCOPE}/${E2E_SKILL}`);
      await expect(page.locator("html")).toHaveAttribute("lang", words.lang);
      await expect(
        page.getByRole("link", { name: words.overview, exact: true }).first(),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: words.dependencies, exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: words.install, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: words.propose })).toBeVisible();
      await expect(page.getByRole("button", { name: words.star })).toBeVisible();
      // The Pin menu (125): everyone administers their own personal workspace, so it is there.
      await page.getByRole("button", { name: words.pin, exact: true }).click();
      const menu = page.getByRole("dialog");
      await expect(menu.getByRole("button", { name: words.pinDone })).toBeVisible();
      await noEnglish(page, words.lang);
      await menu.getByRole("button", { name: words.pinDone }).click();
      // The usage card names the peak's day in the language, with the count.
      const usage = page.getByRole("region", { name: words.usage });
      const peakDay = new Date(Date.now() - 3 * 86_400_000).toLocaleDateString(words.lang, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
      await expect(usage.getByText(`${E2E_USAGE_PEAK}`).filter({ hasText: peakDay })).toBeVisible();
      // The helper beside Install is in the language, and its link opens the language's pages.
      await page.getByText(words.howInstall).first().click();
      await expect(
        page.getByRole("link", { name: /Learn more|Saiba mais|En savoir plus/ }).first(),
      ).toHaveAttribute("href", new RegExp(`/${words.lang}/marketplace/docs/`));
      await noEnglish(page, words.lang);
      await context.close();
    });

    test("the Workspaces list and a workspace's page", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, words.locale);
      await page.goto("/workspaces");
      await expect(page.getByRole("heading", { name: words.workspaces, level: 1 })).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: "global" });
      await expect(row.getByText(words.everyone, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "global", exact: true }).click();
      await expect(page).toHaveURL(/\/workspaces\/global$/);
      await expect(page.getByRole("link", { name: words.allWorkspaces })).toBeVisible();
      await expect(page.getByRole("link", { name: words.scopes, exact: true })).toBeVisible();
      await noEnglish(page, words.lang);
      // Everyone is in global: its join page says so, in the language.
      await page.goto("/workspaces/global/join");
      await expect(page.locator("html")).toHaveAttribute("lang", words.lang);
      await expect(page.getByText(words.joined)).toBeVisible();
      await noEnglish(page, words.lang);
      await page.goto("/workspaces");
      await noEnglish(page, words.lang);
      await context.close();
    });
  });
}
