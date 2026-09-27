import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string, password: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Signed in: the page left /sign-in (the header shows the name, not the email).
  await expect(page).not.toHaveURL(/\/sign-in/);
};

test("root creates a user, who signs in with the shown password; disabling them ends it", async ({
  browser,
}) => {
  const root = await browser.newPage();
  await signIn(root, E2E_USERS.root, E2E_PASSWORD);
  await root.getByRole("link", { name: "Admin" }).click();
  await expect(root.getByRole("heading", { name: "Users" })).toBeVisible();

  // Create, with a generated password.
  const email = "created-by-root@e2e.test";
  await root.getByRole("button", { name: "Create user" }).click();
  const create = root.getByRole("dialog");
  await create.getByLabel("Email").fill(email);
  await create.getByLabel("Name").fill("Created By Root");
  await create.getByRole("button", { name: "Create user" }).click();
  await expect(create.getByText("Shown once")).toBeVisible();
  const password = (await create.locator("code").nth(1).innerText()).trim();
  expect(password).toHaveLength(20);
  await create.getByRole("button", { name: "Done" }).click();
  await expect(root.getByRole("cell", { name: email, exact: true })).toBeVisible();

  // The new user signs in with it.
  const user = await browser.newPage();
  await signIn(user, email, password);

  // Root disables them; their next request goes to sign-in.
  await root
    .getByRole("group", { name: `Actions for ${email}` })
    .getByRole("button", { name: "Disable" })
    .click();
  const disable = root.getByRole("dialog");
  await expect(disable.getByText(/signs them out everywhere \(1 session\)/)).toBeVisible();
  await disable.getByRole("button", { name: "Disable user" }).click();
  await expect(disable.getByText("Disabled.")).toBeVisible();
  await disable.getByRole("button", { name: "Done" }).click();
  await expect(root.getByRole("row").filter({ hasText: email })).toContainText("disabled");

  await user.goto("/");
  await expect(user).toHaveURL(/\/sign-in$/);
});
