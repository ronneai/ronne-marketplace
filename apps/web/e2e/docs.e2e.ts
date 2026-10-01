import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

test("a user opens a helper in the New item form, follows it to the Documentation, and moves between topics", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.reader);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto("/submissions/new");
  // A helper opens as a popover next to its question (050): nothing on the page moves.
  const question = page.getByRole("button", { name: "What's a scope?" });
  const answer = page.getByRole("dialog", { name: "What's a scope?" });
  const below = page.getByRole("button", { name: "Create draft" });
  await expect(question).toHaveAttribute("aria-expanded", "false");
  await expect(answer).toHaveCount(0);
  const before = await below.boundingBox();
  await question.click();
  await expect(answer.getByText(/The first part of an item's name/)).toBeVisible();
  await expect(question).toHaveAttribute("aria-expanded", "true");
  expect(await below.boundingBox()).toEqual(before);
  // Inside the window, with its margin.
  const box = await answer.boundingBox();
  const window = page.viewportSize();
  expect(box && window).toBeTruthy();
  if (box && window) {
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(window.width - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(window.height);
  }
  // Esc closes it, and focus goes back to the question.
  await page.keyboard.press("Escape");
  await expect(answer).toHaveCount(0);
  await expect(question).toBeFocused();
  await question.click();
  await answer.getByRole("link", { name: "Learn more" }).click();

  await expect(page).toHaveURL(/\/docs\/scopes#what$/);
  await expect(page.getByRole("heading", { level: 1, name: "Scopes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What a scope is" })).toBeVisible();
  const topics = page.getByRole("navigation", { name: "Documentation" });
  await expect(topics.getByRole("link", { name: "Scopes" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await topics.getByRole("link", { name: "Versions and tags" }).click();
  await expect(page).toHaveURL(/\/docs\/versions$/);
  await expect(page.getByRole("heading", { name: "Deprecate or yank" })).toBeVisible();
  // Docs is in the main nav.
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Docs" }),
  ).toHaveAttribute("aria-current", "page");
});
