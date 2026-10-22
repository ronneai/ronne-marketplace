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
