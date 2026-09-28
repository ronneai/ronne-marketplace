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
  const help = page.locator("details").filter({ hasText: "What's a scope?" });
  await expect(help.getByText(/The first part of an item's name/)).toBeHidden();
  await help.getByText("What's a scope?").click();
  await expect(help.getByText(/The first part of an item's name/)).toBeVisible();
  await help.getByRole("link", { name: "Learn more" }).click();

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
