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

/** A user's row, by the exact email cell (one email can be part of another). */
const rowOf = (page: Page, email: string) =>
  page.getByRole("row").filter({ has: page.getByRole("cell", { name: email, exact: true }) });

// One root sign-in for all of user admin (docs/knowledge/e2e-sign-in-limit.md), so 059's
// promote and demote checks live in this test too.
test("root creates a user, who signs in with the shown password; disabling them ends it", async ({
  browser,
}) => {
  const root = await browser.newPage();
  await signIn(root, E2E_USERS.root, E2E_PASSWORD);
  await root.getByRole("link", { name: "Admin" }).click();
  await expect(root.getByRole("heading", { name: "Users" })).toBeVisible();

  // Create, with a generated password. Choosing root warns first (059).
  const email = "created-by-root@e2e.test";
  await root.getByRole("button", { name: "Create user" }).click();
  const create = root.getByRole("dialog");
  await create.getByLabel("Role").selectOption("root");
  await expect(create.getByText("Root can do everything.")).toBeVisible();
  await create.getByLabel("Role").selectOption("user");
  await expect(create.getByText("Root can do everything.")).toBeHidden();
  await create.getByLabel("Email").fill(email);
  await create.getByLabel("Name").fill("Created By Root");
  await create.getByRole("button", { name: "Create user" }).click();
  await expect(create.getByText("Shown once")).toBeVisible();
  const password = (await create.locator("code").nth(1).innerText()).trim();
  expect(password).toHaveLength(20);
  await create.getByRole("button", { name: "Done" }).click();
  await expect(root.getByRole("cell", { name: email, exact: true })).toBeVisible();

  // The list sorts on the server (061): by email from its header, the view kept in the URL.
  await root.getByRole("link", { name: "Email" }).click();
  await expect(root).toHaveURL(/sort=email/);
  await expect(root.getByRole("columnheader", { name: "Email" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(root.getByRole("cell", { name: email, exact: true })).toBeVisible();

  // The new user signs in with it.
  const user = await browser.newPage();
  await signIn(user, email, password);

  // Root's own row is read-only; the user isn't an admin yet.
  await expect(
    rowOf(root, E2E_USERS.root).getByRole("button", {
      name: "Why can't I change my own account here?",
    }),
  ).toBeVisible();
  await expect(root.getByRole("group", { name: `Actions for ${E2E_USERS.root}` })).toHaveCount(0);
  expect((await user.goto("/admin/users"))?.status()).toBe(404);

  // Root makes them root, with a warning; it takes effect on their next request (059).
  const changeRole = async (to: "root" | "user", warning: string) => {
    await root
      .getByRole("group", { name: `Actions for ${email}` })
      .getByRole("button", { name: "Change role" })
      .click();
    const dialog = root.getByRole("dialog");
    await dialog.getByLabel("New role").selectOption(to);
    await expect(dialog.getByText(warning)).toBeVisible();
    await dialog.getByRole("button", { name: "Change role" }).click();
    await expect(dialog.getByText(`Role changed to ${to}.`)).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
  };
  await changeRole("root", `Make ${email} root?`);
  expect((await user.goto("/admin/users"))?.status()).toBe(200);
  await expect(
    rowOf(user, email).getByRole("button", { name: "Why can't I change my own account here?" }),
  ).toBeVisible();
  await expect(user.getByRole("group", { name: `Actions for ${email}` })).toHaveCount(0);
  await expect(
    user
      .getByRole("group", { name: `Actions for ${E2E_USERS.root}` })
      .getByRole("button", { name: "Change role" }),
  ).toBeVisible();

  // And removes root again: the admin area is a 404 for them on their next request.
  await changeRole("user", `Remove root from ${email}?`);
  expect((await user.goto("/admin/users"))?.status()).toBe(404);

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
