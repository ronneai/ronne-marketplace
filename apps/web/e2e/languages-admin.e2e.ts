import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 132: Admin speaks the person's language: Users and a user's page, the Audit log and
 * every Settings tab, in Portuguese and French, with none of the English left over (core's and the
 * identity domain's messages, and data, aside). One root of its own signs in once (the sign-in
 * limit, docs/knowledge/e2e-sign-in-limit.md) and the same session opens in a browser per language.
 */
let session: Awaited<ReturnType<BrowserContext["storageState"]>>;

/** The message files, flattened: `admin.users.title` → "Users". */
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
const NAMESPACES = ["admin", "common", "shell", "help", "errors", "workspaces", "types"];
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

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.adminLanguages);
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
      .split(/[\n\t]/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const leaks = Object.entries(english)
    .filter(([key, text]) => text.length >= 4 && !/[{<]/.test(text) && text !== own[key])
    .filter(([key, text]) => !ownTexts.has(text) && !except.includes(key))
    .filter(([, text]) => lines.has(text))
    .map(([key]) => key);
  expect(leaks, `English left on ${page.url()}`).toEqual([]);
};

for (const [locale, lang] of [
  ["pt-BR", "pt"],
  ["fr-CA", "fr"],
] as const) {
  test.describe(`in ${lang}`, () => {
    const words = loadAll(lang);
    const word = (key: string) => {
      const text = words[key];
      if (!text) throw new Error(`No message ${key} in ${lang}`);
      return text;
    };

    test("Users and a user's page", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, locale);
      await page.goto("/admin/users");
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(
        page.getByRole("heading", { name: word("admin.users.title"), level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: word("admin.users.create.button") }),
      ).toBeVisible();
      await noEnglish(page, lang);
      // The dialog to create a user, open.
      await page.getByRole("button", { name: word("admin.users.create.button") }).click();
      await expect(
        page.getByRole("dialog", { name: word("admin.users.create.title") }),
      ).toBeVisible();
      await noEnglish(page, lang);
      await page.keyboard.press("Escape");
      // A user's page, found by a search (the list is paged).
      await page.goto(`/admin/users?q=${encodeURIComponent(E2E_USERS.languages)}`);
      await page
        .getByRole("row")
        .filter({ hasText: E2E_USERS.languages })
        .getByRole("link")
        .first()
        .click();
      await expect(page).toHaveURL(/\/admin\/users\/[0-9A-Z]{26}$/);
      await expect(
        page.getByRole("heading", { name: word("admin.userPage.sections.account"), exact: true }),
      ).toBeVisible();
      await noEnglish(page, lang);
      await context.close();
    });

    test("the Audit log", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, locale);
      await page.goto("/admin/audit");
      await expect(
        page.getByRole("heading", { name: word("admin.audit.title"), level: 1 }),
      ).toBeVisible();
      await expect(page.locator("#action")).toBeVisible();
      await noEnglish(page, lang);
      // An event's details, in the dialog.
      await page
        .getByRole("link", { name: new RegExp(`^${word("admin.audit.detailsTitle")}`) })
        .first()
        .click();
      await expect(
        page.getByRole("dialog", { name: word("admin.audit.dialog.title") }),
      ).toBeVisible();
      await noEnglish(page, lang);
      await context.close();
    });

    test("every Settings tab", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, locale);
      for (const tab of ["usage", "feeds", "authentication", "privacy", "notice"] as const) {
        await page.goto(tab === "usage" ? "/admin/settings" : `/admin/settings?tab=${tab}`);
        await expect(
          page.getByRole("heading", { name: word("admin.settings.page.title"), level: 1 }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: word(`admin.settings.tabs.${tab}`), exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await noEnglish(page, lang);
      }
      // A provider's page: the presets as cards (their names and the instructions are the
      // identity domain's, so only the frame is read).
      await page.goto("/admin/settings?tab=authentication&provider=new");
      await expect(page.getByText(word("admin.settings.providerForm.chooseTitle"))).toBeVisible();
      await noEnglish(page, lang);
      await context.close();
    });
  });
}
