import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 127 on a desktop browser: Send feedback from the sidebar's dialog, and from the page
 * without JavaScript. Each person signs in once (docs/knowledge/e2e-sign-in-limit.md).
 */
const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
};

test("the sidebar opens the dialog, refuses what is missing, sends, and gives focus back", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.feedbackSender);
  await page.goto("/catalogue?q=secret-search");
  const link = page.getByRole("link", { name: "Send feedback" });
  await link.click();
  const dialog = page.getByRole("dialog", { name: "Send feedback" });
  await expect(dialog).toBeVisible();
  // The page they are on is offered as a path, never with its query.
  await expect(dialog.getByLabel("Include the page I’m on")).toBeChecked();
  await expect(dialog.getByText("/catalogue", { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText("secret-search");

  await dialog.getByRole("button", { name: "Send feedback" }).click();
  await expect(dialog.getByText("Choose what kind of feedback this is.")).toBeVisible();
  await dialog.getByLabel("Idea").check();
  await dialog.getByLabel("Message").fill("   ");
  await dialog.getByRole("button", { name: "Send feedback" }).click();
  await expect(dialog.getByText("Write a message.")).toBeVisible();
  // What was typed is kept.
  await expect(dialog.getByLabel("Idea")).toBeChecked();

  await dialog.getByLabel("Message").fill("Dark mode, please.");
  await dialog.getByRole("button", { name: "Send feedback" }).click();
  await expect(
    dialog.getByText("Thanks, your feedback was sent to this instance’s administrators."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(link).toBeFocused();

  // Cancel closes without sending, and the next opening starts empty.
  await link.click();
  await expect(dialog.getByLabel("Message")).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("the page sends feedback without JavaScript and keeps what was typed when refused", async ({
  browser,
  baseURL,
}) => {
  const withScript = await browser.newContext({ baseURL });
  const first = await withScript.newPage();
  await signIn(first, E2E_USERS.feedbackNoJs);
  const state = await withScript.storageState();
  await withScript.close();

  const context = await browser.newContext({
    baseURL,
    storageState: state,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  // The sidebar's link carries the page they are on.
  await page.goto("/catalogue?q=secret-search");
  await expect(page.getByRole("link", { name: "Send feedback" })).toHaveAttribute(
    "href",
    "/feedback?from=%2Fcatalogue",
  );
  await page.getByRole("link", { name: "Send feedback" }).click();
  await expect(page).toHaveURL(/\/feedback\?from=%2Fcatalogue$/);
  await expect(page.getByRole("heading", { name: "Send feedback", level: 1 })).toBeVisible();
  await page.getByLabel("Question").check();
  await page.getByLabel("Message").fill(" ");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Write a message.")).toBeVisible();
  await expect(page.getByLabel("Question")).toBeChecked();
  await page.getByLabel("Message").fill("How do I add a scope?");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thanks, your feedback was sent")).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await context.close();
});

test("root reads the inbox, marks two of four handled, and deletes one after asking", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.feedbackRoot);
  const tag = `inbox-${Date.now()}`;
  const send = async (message: string) => {
    await page.goto("/feedback");
    await page.getByLabel("Problem").check();
    await page.getByLabel("Message").fill(message);
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText("Thanks, your feedback was sent")).toBeVisible();
  };
  for (const n of [1, 2, 3]) await send(`${tag} message ${n} <b>bold</b>`);
  // One with line breaks and another language, shown as written in its detail dialog.
  await send(`${tag} multi\nsegunda linha: dúvida 日本語`);

  await page.goto(`/admin/feedback?q=${tag}`);
  const rows = page.getByRole("row", { name: /Feedback Root/ });
  await expect(rows).toHaveCount(4);
  // Plain text: the tags are shown, not obeyed.
  await expect(page.locator("tbody b")).toHaveCount(0);
  await expect(page.getByText(`${tag} message 1 <b>bold</b>`)).toBeVisible();

  // The sidebar's Feedback link says how many are new, and it includes these three.
  // The detail dialog shows a message as written: its line break kept, any language.
  await page
    .getByRole("row", { name: /Feedback Root/ })
    .filter({ hasText: "multi" })
    .getByRole("button", { name: "Open the message from Feedback Root" })
    .click();
  const written = page.getByRole("dialog", { name: "Feedback from Feedback Root" });
  const body = written.locator("p", { hasText: "segunda linha" });
  await expect(body).toHaveCSS("white-space", "pre-wrap");
  await expect(body).toHaveText(`${tag} multi\nsegunda linha: dúvida 日本語`);
  await written.getByRole("button", { name: "Close" }).click();
  await expect(written).toBeHidden();

  const countLink = page.getByRole("link", { name: /^Feedback\s*\d+/ });
  const waiting = async () =>
    Number(/(\d+)/.exec((await countLink.textContent()) ?? "")?.[1] ?? "0");
  const before = await waiting();
  expect(before).toBeGreaterThanOrEqual(3);

  const checks = page.getByRole("checkbox", { name: "Select the message from Feedback Root" });
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Mark handled" }).click();
  await expect(page.getByText("2 messages marked handled.")).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Feedback Root/ }).filter({ hasText: "Handled" }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("row", { name: /Feedback Root/ }).filter({ hasText: "New" }),
  ).toHaveCount(2);
  await expect.poll(waiting).toBe(before - 2);

  // Delete asks first: Cancel leaves everything.
  await page
    .getByRole("checkbox", { name: "Select the message from Feedback Root" })
    .nth(2)
    .check();
  await page.getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this message?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(rows).toHaveCount(4);
  await page.getByRole("button", { name: "Delete" }).click();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("1 message deleted.")).toBeVisible();
  await expect(rows).toHaveCount(3);

  // A row opens its whole message, with Mark handled for a new one.
  await page.getByRole("button", { name: "Open the message from Feedback Root" }).first().click();
  const detail = page.getByRole("dialog", { name: "Feedback from Feedback Root" });
  await expect(detail.getByText(tag, { exact: false })).toBeVisible();
  await expect(detail.getByText("feedback-root@e2e.test", { exact: false })).toBeVisible();
});

test("the tenth message of the hour goes through and the eleventh is refused", async ({ page }) => {
  await signIn(page, E2E_USERS.feedbackLimit);
  const send = async (message: string) => {
    await page.goto("/feedback");
    await page.getByLabel("Idea").check();
    await page.getByLabel("Message").fill(message);
    await page.getByRole("button", { name: "Send feedback" }).click();
  };
  for (let n = 1; n <= 10; n++) {
    await send(`limit ${n}`);
    await expect(page.getByText("Thanks, your feedback was sent")).toBeVisible();
  }
  await send("limit 11");
  await expect(page.getByText("You can send 10 messages an hour. Try again later.")).toBeVisible();
  // What they typed is kept, so nothing is lost.
  await expect(page.getByLabel("Message")).toHaveValue("limit 11");
});

test("erasing an account deletes the feedback it sent", async ({ browser, baseURL }) => {
  const sender = await browser.newContext({ baseURL });
  const senderPage = await sender.newPage();
  await signIn(senderPage, E2E_USERS.feedbackErasable);
  const tag = `erasable-${Date.now()}`;
  await senderPage.goto("/feedback");
  await senderPage.getByLabel("Problem").check();
  await senderPage.getByLabel("Message").fill(`${tag} please forget me`);
  await senderPage.getByRole("button", { name: "Send feedback" }).click();
  await expect(senderPage.getByText("Thanks, your feedback was sent")).toBeVisible();
  await sender.close();

  const rootContext = await browser.newContext({ baseURL });
  const root = await rootContext.newPage();
  await signIn(root, E2E_USERS.feedbackRoot);
  await root.goto(`/admin/feedback?q=${tag}`);
  await expect(root.getByText(`${tag} please forget me`)).toBeVisible();

  await root.goto(`/admin/users?q=${E2E_USERS.feedbackErasable}`);
  await root
    .getByRole("row")
    .filter({ hasText: E2E_USERS.feedbackErasable })
    .getByRole("link")
    .first()
    .click();
  await root.getByRole("button", { name: "Erase", exact: true }).click();
  const erase = root.getByRole("dialog", { name: "Erase user" });
  await erase.getByLabel("Type the account’s email to confirm").fill(E2E_USERS.feedbackErasable);
  await erase.getByRole("button", { name: "Erase" }).click();
  await expect(erase.getByText(/Erased\. The account is now deleted-user/)).toBeVisible();

  await root.goto(`/admin/feedback?q=${tag}`);
  await expect(root.getByText("No feedback matches these filters.")).toBeVisible();
  await expect(root.locator("table").getByText(tag)).toHaveCount(0);
  await rootContext.close();
});
