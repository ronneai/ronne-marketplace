import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { headerName } from "./helpers";

// The web setup (feature 036) without JavaScript: one form, one Install, then sign-in.
const instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").nojs as { dir: string };
const root = { email: "root@e2e.test", name: "Root", password: "correct horse battery" };

test("sets the instance up with one form, and lands on sign-in with the email filled in", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.locator('form[data-setup="wizard"]')).toHaveCount(0);

  await page.locator('select[name="database.kind"]').selectOption("sqlite");
  await page.locator('input[name="database.path"]').fill(join(instance.dir, "ronne.db"));
  await page.locator('input[name="root.email"]').fill(root.email);
  await page.locator('input[name="root.name"]').fill(root.name);
  // A password that's too short comes back with the progress and the error, passwords cleared.
  await page.locator('input[name="root.password"]').fill("short");
  await page.locator('input[name="root.password_again"]').fill("short");
  await page.getByRole("button", { name: "Install" }).click();
  await expect(page.locator('li[data-step="settings"]')).toHaveAttribute("data-status", "done");
  await expect(page.locator('li[data-step="root"]')).toHaveAttribute("data-status", "failed");
  await expect(page.locator('input[name="root.password"]')).toHaveValue("");
  await expect(page.locator('input[name="root.email"]')).toHaveValue(root.email);

  await page.locator('input[name="root.password"]').fill(root.password);
  await page.locator('input[name="root.password_again"]').fill(root.password);
  await page.getByRole("button", { name: "Install" }).click();
  await expect(page).toHaveURL(/\/sign-in\?email=root%40e2e\.test&setup=done$/);
  await expect(page.getByText("Ronne AI Marketplace is set up")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(root.email);
  await page.getByLabel("Password", { exact: true }).fill(root.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(headerName(page, root.name)).toBeVisible();
});
