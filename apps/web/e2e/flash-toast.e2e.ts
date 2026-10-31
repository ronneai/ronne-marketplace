import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

/**
 * Feature 138: an action that redirects leaves a toast on the page it lands on, once, in the
 * person's language. Deleting a draft for good goes to My submissions.
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const newDraft = async (page: Page, name: string) => {
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[value="${E2E_SCOPE}"]`) })
    .click();
  await page.getByLabel("Name").fill(name);
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="rule"]') })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);
  return page.url();
};

const flash = (page: Page) => page.locator("[data-toast-kind]");

test("deleting a draft says so once, then not again, in English and in Portuguese", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(page, E2E_USERS.flashAuthor);

  // English: one toast, gone after the page is shown again.
  await newDraft(page, "flash-en");
  const setCookies: string[] = [];
  page.on("response", async (response) => {
    const headers = await response.headersArray().catch(() => []);
    for (const h of headers) if (h.name.toLowerCase() === "set-cookie") setCookies.push(h.value);
  });
  await page.getByRole("button", { name: "Withdraw" }).click();
  let withdraw = page.getByRole("dialog", { name: /Withdraw/ });
  await withdraw.getByRole("radio", { name: /Delete for good/ }).check();
  await withdraw.getByRole("button", { name: "Delete for good" }).click();
  await expect(page).toHaveURL(/\/submissions$/);
  // The cookie the action set: 30 seconds, same site, the whole site, holding a key, not text.
  const set = setCookies.find(
    (value) => value.startsWith("ronne-toast=") && !/Max-Age=0/i.test(value),
  );
  expect(set, "the action set the flash cookie").toBeDefined();
  expect(set).toMatch(/Max-Age=30/i);
  expect(set).toMatch(/SameSite=Lax/i);
  expect(set).toMatch(/Path=\//i);
  expect(decodeURIComponent(set ?? "")).toContain('"k":"draftDeleted"');
  expect(decodeURIComponent(set ?? "")).not.toContain("Draft deleted");
  await expect(flash(page)).toHaveCount(1);
  await expect(flash(page)).toHaveText("OK:Draft deleted");
  // The cookie was taken as soon as it was shown.
  expect((await context.cookies()).some((c) => c.name === "ronne-toast")).toBe(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "My submissions" })).toBeVisible();
  await expect(flash(page)).toHaveCount(0);

  // Portuguese: the same action, said in the reader's language.
  const url = await newDraft(page, "flash-pt");
  await context.addCookies([{ name: "ronne-locale", value: "pt", url: baseURL ?? "/" }]);
  await page.goto(url);
  await page.getByRole("button", { name: "Retirar" }).first().click();
  withdraw = page.getByRole("dialog", { name: /Retirar/ });
  await withdraw.getByRole("radio", { name: /Excluir de vez/ }).check();
  await withdraw.getByRole("button", { name: "Excluir de vez" }).click();
  await expect(page).toHaveURL(/\/submissions$/);
  await expect(flash(page)).toHaveText("OK:Rascunho excluído");
});

test("a cookie someone edited shows nothing", async ({ page, context, baseURL }) => {
  await signIn(page, E2E_USERS.flashAuthor);
  for (const value of [
    JSON.stringify({ i: "x", k: "not-ours" }),
    JSON.stringify({ i: "x", k: "draftDeleted", p: { a: { b: 1 } } }),
    "<script>window.__flash=1</script>",
  ]) {
    await context.addCookies([
      { name: "ronne-toast", value: encodeURIComponent(value), url: baseURL ?? "/" },
    ]);
    await page.goto("/submissions");
    await expect(page.getByRole("heading", { name: "My submissions" })).toBeVisible();
    await expect(flash(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __flash?: number }).__flash)).toBeUndefined();
  }
});

test("without JavaScript nothing shows the flash, and nothing breaks", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await signIn(page, E2E_USERS.flashAuthor);
  await context.addCookies([
    {
      name: "ronne-toast",
      value: encodeURIComponent(JSON.stringify({ i: "nojs", k: "draftDeleted" })),
      url: baseURL ?? "/",
    },
  ]);
  await page.goto("/submissions");
  await expect(page.getByRole("heading", { name: "My submissions" })).toBeVisible();
  await expect(flash(page)).toHaveCount(0);
  // Only the page's script takes the cookie away: here it stays until its 30 seconds are up.
  expect((await context.cookies()).some((c) => c.name === "ronne-toast")).toBe(true);
  await context.close();
});

test("a flash left for a page that fails to show is taken by the next page, once", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(page, E2E_USERS.flashAuthor);
  await context.addCookies([
    {
      name: "ronne-toast",
      value: encodeURIComponent(JSON.stringify({ i: "late", k: "draftDeleted" })),
      url: baseURL ?? "/",
    },
  ]);
  // A page that isn't there: the error page has the toast region too, so the flash is shown
  // there, late, and the cookie goes.
  const response = await page.goto("/no-such-page-for-the-flash");
  expect(response?.status()).toBe(404);
  await expect(flash(page)).toHaveCount(1);
  await expect(flash(page)).toHaveText("OK:Draft deleted");
  expect((await context.cookies()).some((c) => c.name === "ronne-toast")).toBe(false);
  await page.goto("/submissions");
  await expect(page.getByRole("heading", { name: "My submissions" })).toBeVisible();
  await expect(flash(page)).toHaveCount(0);
});
