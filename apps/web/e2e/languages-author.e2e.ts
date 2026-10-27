import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { loadAll, noEnglish } from "./no-english";
import { E2E_PASSWORD, E2E_SCOPE, E2E_SKILL, E2E_USERS } from "./users";

/**
 * Feature 131: the screens people use to write and review items speak their language: Propose
 * item, the editor, My submissions, the review queue, a review's page and an item's Versions tab,
 * in Portuguese and French, with none of the English left over (core's messages and data aside).
 * One moderator of its own signs in once (the sign-in limit, docs/knowledge/e2e-sign-in-limit.md),
 * submits a skill in English, and the same session opens in a browser per language.
 */
let session: Awaited<ReturnType<BrowserContext["storageState"]>>;
let submitted = "";
/** A name of its own per run, so a retried `beforeAll` never meets the one it made before. */
const RUN = Date.now().toString(36);

/** Makes a skill draft from Propose item; the form's fields are found by name, not by words. */
const newDraft = async (page: Page, name: string) => {
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[name="scope"][value="${E2E_SCOPE}"]`) })
    .click();
  await page.locator('input[name="name"]').fill(name);
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="skill"]') })
    .click();
  await page
    .locator("form")
    .filter({ has: page.locator('input[name="name"]') })
    .locator('button[type="submit"]')
    .click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
};

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.authorLanguages);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  // A skill in review, for My submissions, the queue and its review page (as submit.e2e.ts).
  await newDraft(page, `languages-review-${RUN}`);
  submitted = new URL(page.url()).pathname.split("/").at(-1) ?? "";
  await page.getByLabel("description").fill("Reviews code in any language.");
  await page
    .getByRole("list", { name: "Files" })
    .getByRole("button", { name: /SKILL\.md/ })
    .click();
  await page.getByLabel("Contents of SKILL.md").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(
    `---\nname: languages-review-${RUN}\ndescription: Reviews code in any language.\n---\n\nRead it twice.\n`,
  );
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText(/Saved at/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  const dialog = page.getByRole("dialog", { name: "Submit for review" });
  await expect(dialog.getByText("All checks passed.")).toBeVisible();
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText(/Submitted for review on/)).toBeVisible();
  session = await context.storageState();
  await context.close();
});

const open = async (browser: Browser, baseURL: string | undefined, locale: string) => {
  const context = await browser.newContext({ baseURL, locale, storageState: session });
  return { context, page: await context.newPage() };
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

    test("Propose item and the editor of a new draft", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, locale);
      await page.goto("/submissions/new");
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(
        page.getByRole("heading", { name: word("author.newDraft.title") }),
      ).toBeVisible();
      await noEnglish(page, lang);
      await newDraft(page, `languages-${lang}-${RUN}`);
      await expect(
        page.getByRole("button", { name: word("author.editor.settings") }),
      ).toBeVisible();
      await expect(page.getByRole("list", { name: word("author.files.tree") })).toBeVisible();
      // The template's placeholders are problems: their words are core's, English by decision.
      await noEnglish(page, lang);
      await context.close();
    });

    test("My submissions, the review queue and the review's page", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, locale);
      await page.goto("/submissions");
      await expect(
        page.getByRole("heading", { name: word("author.submissions.title") }),
      ).toBeVisible();
      await expect(page.getByText(`@${E2E_SCOPE}/languages-review-${RUN}`).first()).toBeVisible();
      await noEnglish(page, lang);

      await page.goto("/reviews");
      await expect(page.getByRole("heading", { name: word("author.queue.title") })).toBeVisible();
      await expect(page.getByRole("link", { name: word("author.queue.tabs.needs") })).toBeVisible();
      // Their own submission can't be ticked, and says why in the language (the `why` codes).
      expect(await page.content()).toContain(word("author.why.own"));
      await noEnglish(page, lang);

      await page.goto(`/reviews/${submitted}`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(
        page.getByRole("button", { name: word("author.review.decision.reject.button") }),
      ).toBeDisabled();
      expect(await page.content()).toContain(word("author.why.own_decide"));
      await noEnglish(page, lang);
      await context.close();
    });

    test("an item's Versions tab", async ({ browser, baseURL }) => {
      const { context, page } = await open(browser, baseURL, locale);
      await page.goto(`/items/${E2E_SCOPE}/${E2E_SKILL}/versions`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByText("1.0.0").first()).toBeVisible();
      await noEnglish(page, lang);
      await context.close();
    });
  });
}
