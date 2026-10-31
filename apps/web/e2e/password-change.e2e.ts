import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createDb } from "../src/server/db/create-db";
import { toDbDate } from "../src/server/db/dates";
import { startRmk } from "./device";
import type { Instance } from "./harness";
import { openUser } from "./helpers";
import { recordSecret } from "./secrets";
import { toastWith } from "./toast";
import { E2E_PASSWORD, E2E_USERS } from "./users";

// Feature 128 on the desktop: someone root asked to choose a new password is held on the change page
// whatever they open, comes back to what they asked for (the rmk login code included), is taken to
// two-factor after it when that is required too, and root asks and stops asking from a user's page.
const instance: Instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main;
const secret = (value: string) => recordSecret(instance, value);

const signIn = async (page: Page, email: string, password = E2E_PASSWORD) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

const changePassword = async (page: Page, current: string, next: string) => {
  secret(next);
  await page.getByLabel("Current password", { exact: true }).fill(current);
  await page.getByLabel("New password", { exact: true }).fill(next);
  await page.getByLabel("Confirm new password", { exact: true }).fill(next);
  await page.getByRole("button", { name: "Change password" }).click();
};

const setRequirement = async (value: "optional" | "everyone") => {
  const { db, dialect } = createDb(instance.env.DATABASE_URL ?? "");
  try {
    const now = toDbDate(new Date(), dialect);
    await db.deleteFrom("instance_settings").where("key", "=", "two_factor_policy").execute();
    await db
      .insertInto("instance_settings")
      .values({ key: "two_factor_policy", value, updated_by: null, updated_at: now })
      .execute();
  } finally {
    await db.destroy();
  }
};

test("held on the change page, then back to the rmk login code it was held from", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, E2E_USERS.mustChange);
  await expect(page).toHaveURL(/\/account\/password/);
  await expect(page.getByText("Choose your own password to continue")).toBeVisible();

  // Every page and every click in the frame comes back here; the page asked for is kept.
  await page.goto("/catalogue");
  await expect(page).toHaveURL(/\/account\/password\?next=%2Fcatalogue/);
  for (const name of ["Home", "Catalogue", "Workspaces"]) {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name, exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/account\/password/);
    await expect(page.getByText("Choose your own password to continue")).toBeVisible();
  }

  // The API refuses their token but for /me, and so does the data download.
  const token = await page.request.post("/api/v1/auth/token", {
    data: { email: E2E_USERS.mustChange, password: E2E_PASSWORD, name: "held" },
  });
  expect(token.status()).toBe(201);
  const headers = { authorization: `Bearer ${(await token.json()).token}` };
  expect((await page.request.get("/api/v1/me", { headers })).status()).toBe(200);
  const refused = await page.request.get("/api/v1/workspaces", { headers });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error.code).toBe("password_change_required");

  // rmk login --web: the code's page is held, and after the change the code is still in the input.
  const home = mkdtempSync(join(tmpdir(), "rmk-e2e-must-change-"));
  const rmk = await startRmk(home, "rmk on e2e-held");
  await page.goto(`/device?user_code=${rmk.code}`);
  await expect(page).toHaveURL(/\/account\/password\?next=%2Fdevice%3Fuser_code/);
  const chosen = `${E2E_PASSWORD} chosen`;
  await changePassword(page, E2E_PASSWORD, chosen);
  await expect(page).toHaveURL(/\/device\?user_code=/);
  await expect(page.getByLabel("Code")).toHaveValue(rmk.code);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved" })).toBeVisible();
  const signedIn = await rmk.done;
  expect(signedIn.status, signedIn.err).toBe(0);
  // Their token (made while held) is free now: the change clears the request, not the token.
  expect((await page.request.get("/api/v1/workspaces", { headers })).status()).toBe(200);
});

test("the password comes first, then two-factor", async ({ page }) => {
  // Start from a known policy: an earlier run that was killed may have left one on.
  await setRequirement("optional");
  await setRequirement("everyone");
  try {
    await signIn(page, E2E_USERS.mustChangeTwoFactor);
    await expect(page).toHaveURL(/\/account\/password/);
    // Not the two-factor page yet, even if they ask for it.
    await page.goto("/account/security");
    await expect(page).toHaveURL(/\/account\/password/);
    await changePassword(page, E2E_PASSWORD, `${E2E_PASSWORD} own`);
    await expect(page).toHaveURL(/\/account\/security$/);
    await expect(page.getByText("Set up two-factor sign-in to continue")).toBeVisible();
  } finally {
    await setRequirement("optional");
  }
});

test("root asks, stops asking, and a new account can be left alone", async ({ browser }) => {
  const root = await browser.newPage();
  await signIn(root, E2E_USERS.mustChangeRoot);
  const askee = E2E_USERS.mustChangeAsk;
  await openUser(root, askee);
  await expect(root.getByText("Not asked")).toBeVisible();

  const user = await browser.newPage();
  await signIn(user, askee);
  await user.goto("/catalogue");
  await expect(user).toHaveURL(/\/catalogue$/);

  // Ask: their next request is held, with no new sign-in.
  await root.getByRole("button", { name: "Ask for a new password" }).click();
  const ask = root.getByRole("dialog", { name: "Ask for a new password" });
  await ask.getByRole("button", { name: "Ask for a new password" }).click();
  await expect(toastWith(ask, "will be asked to choose a new password")).toBeVisible();
  await expect(ask).toBeHidden();
  await expect(root.getByText("Asked at their next sign-in")).toBeVisible();
  await user.goto("/catalogue");
  await expect(user).toHaveURL(/\/account\/password\?next=%2Fcatalogue/);

  // Stop: the next request is free again.
  await root.getByRole("button", { name: "Stop asking for a new password" }).click();
  const stop = root.getByRole("dialog", { name: "Stop asking for a new password" });
  await stop.getByRole("button", { name: "Stop asking for a new password" }).click();
  await expect(toastWith(stop, "no longer be asked")).toBeVisible();
  await expect(stop).toBeHidden();
  await expect(root.getByText("Not asked")).toBeVisible();
  await user.goto("/catalogue");
  await expect(user).toHaveURL(/\/catalogue$/);

  // A new account with the box unchecked signs in and is not held.
  await root.goto("/admin/users");
  await root.getByRole("button", { name: "Create user" }).click();
  const create = root.getByRole("dialog");
  const box = create.getByRole("checkbox", {
    name: "Ask them to choose a new password when they sign in",
  });
  await expect(box).toBeChecked();
  await box.uncheck();
  const email = "left-alone@e2e.test";
  await create.getByLabel("Email").fill(email);
  await create.getByLabel("Name").fill("Left Alone");
  await create.getByRole("button", { name: "Create user" }).click();
  await expect(create.getByText("Shown once")).toBeVisible();
  const password = (await create.locator("code").nth(1).innerText()).trim();
  secret(password);
  await create.getByRole("button", { name: "Done" }).click();
  const fresh = await browser.newPage();
  await signIn(fresh, email, password);
  await expect(fresh).not.toHaveURL(/\/account\/password/);
  await expect(fresh).toHaveURL(/\/$/);
  // The audit log says the box was unchecked.
  await root.goto("/admin/audit?action=user.created");
  const created = root.getByText(/Created left-alone@e2e\.test as user/).first();
  await expect(created).toBeVisible();
  await expect(created).not.toContainText("asking for a new password");
});
