import { type Browser, expect, type Page, test } from "@playwright/test";
import { headerName, openUser } from "./helpers";
import { toastWith } from "./toast";
import { E2E_NAMES, E2E_PASSWORD, E2E_USERS } from "./users";

// The longest token lifetime (162): root sets it, a person's older token gets shortened, and root
// sees that person's tokens on their page. Root restores the defaults (365 and 90 days) before the
// end, so the other tests' tokens are made as always; "no limit" in between changes no default.

const signInAs = async (browser: Browser, who: keyof typeof E2E_USERS): Promise<Page> => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS[who]);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(headerName(page, E2E_NAMES[who])).toBeVisible();
  return page;
};

const panel = (page: Page) => page.getByRole("form", { name: "Access tokens" });

const setCaps = async (page: Page, everyone: string, reviewers: string) => {
  await page.goto("/admin/settings?tab=authentication");
  await panel(page).getByLabel("Longest lifetime").selectOption({ label: everyone });
  await panel(page).getByLabel("For reviewers and root").selectOption({ label: reviewers });
  const save = panel(page).getByRole("button", { name: "Save" });
  // Save is off when nothing changed (the clean-up, after the test put them back already).
  if (!(await save.isEnabled())) return;
  await save.click();
  await expect(toastWith(page, "Access tokens saved.")).toBeVisible();
};

test("root sets the longest lifetime, shortens an older token, and sees a person's tokens", async ({
  browser,
}) => {
  const root = await signInAs(browser, "tokenPolicyRoot");
  const person = await signInAs(browser, "tokenLifetimes");
  try {
    // No limit allows a token that never expires.
    await setCaps(root, "No limit", "No limit");
    await person.goto("/account/tokens");
    await person.getByRole("button", { name: "Create token" }).click();
    const dialog = person.getByRole("dialog");
    await dialog.getByLabel("Name").fill("forever laptop");
    await dialog.getByLabel("Expires after").selectOption("none");
    await dialog.getByLabel(/works until I revoke it/).check();
    await dialog.getByRole("button", { name: "Create token" }).click();
    await expect(dialog.getByText("Copy it now")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // Back to 365 and 90 days: that token now lasts longer, and Shorten brings it in.
    await setCaps(root, "365 days", "90 days");
    await expect(root.getByText(/\d+ active tokens? lasts? longer than this\./)).toBeVisible();
    await root.getByRole("button", { name: "Shorten them" }).click();
    await root.getByRole("dialog").getByRole("button", { name: "Shorten tokens" }).click();
    await expect(toastWith(root, /Shortened \d+ tokens?\./)).toBeVisible();
    await expect(root.getByText("No active token lasts longer than this.")).toBeVisible();

    // The dialog offers no more than the cap now.
    await person.goto("/account/tokens");
    await person.getByRole("button", { name: "Create token" }).click();
    await expect(
      person.getByRole("dialog").getByLabel("Expires after").locator("option"),
    ).toHaveText(["30 days", "90 days", "365 days"]);
    await person.keyboard.press("Escape");

    // Root sees the person's tokens on their page, never the token itself.
    await openUser(root, E2E_USERS.tokenLifetimes);
    const row = root.getByRole("row").filter({ hasText: "forever laptop" });
    await expect(row).toContainText("the web app");
    await expect(row).toContainText("active");
    await expect(row).not.toContainText("no expiry");
    await expect(root.locator("#user-tokens")).not.toContainText("rmk_");

    // Root revokes it from there: asked first, then said after the page refreshes.
    await root.getByRole("button", { name: "Revoke forever laptop" }).click();
    await root.getByRole("dialog").getByRole("button", { name: "Revoke token" }).click();
    await expect(toastWith(root, "Revoked. It stops working on its next request.")).toBeVisible();
    await expect(row).toContainText("revoked");
    await expect(root.getByRole("button", { name: "Revoke forever laptop" })).toHaveCount(0);
  } finally {
    await setCaps(root, "365 days", "90 days").catch(() => undefined);
    await root.context().close();
    await person.context().close();
  }
});
