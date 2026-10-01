import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const choose = async (page: Page, label: string) => {
  await page.getByRole("radio", { name: new RegExp(`^${label}`) }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Usage reporting saved.")).toBeVisible();
};

test("root sets the usage policy, which is audited; nobody else can see it", async ({
  browser,
}) => {
  const root = await browser.newPage();
  await signIn(root, E2E_USERS.root);
  await root.goto("/admin/settings");
  await expect(root.getByRole("radio", { name: /^Off/ })).toBeChecked();
  await choose(root, "People choose");
  await root.reload();
  await expect(root.getByRole("radio", { name: /^People choose/ })).toBeChecked();

  await root.goto("/admin/audit");
  await expect(root.getByText("settings.usage_policy").first()).toBeVisible();

  const user = await browser.newPage();
  await signIn(user, E2E_USERS.notRoot);
  expect((await user.goto("/admin/settings"))?.status()).toBe(404);

  // Back to a new instance's default, so other tests see an instance that collects nothing.
  await root.goto("/admin/settings");
  await choose(root, "Off");
});
