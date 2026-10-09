import { test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";
import { pinAnExactVersion } from "./version-pin";

test("the dependency menu offers an exact version, and saves it bare (#143)", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.versionPinAuthor);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await pinAnExactVersion(page, "version-pin");
});
