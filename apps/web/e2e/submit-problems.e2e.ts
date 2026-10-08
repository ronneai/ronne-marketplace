import { test } from "@playwright/test";
import { saveAndSeeSubmitProblems } from "./submit-problems";
import { E2E_PASSWORD, E2E_USERS } from "./users";

test("a save shows what Submit would refuse, until it's fixed (#142)", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.problemsAuthor);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await saveAndSeeSubmitProblems(page, "submit-problems");
});
