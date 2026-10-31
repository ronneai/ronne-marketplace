import { expect, test } from "@playwright/test";
import { createDb } from "../src/server/db/create-db";
import { toDbBoolean, toDbDate } from "../src/server/db/dates";
import { totpCode } from "../src/server/domains/identity/testing/totp";
import type { Instance } from "./harness";
import { openUser } from "./helpers";
import { toastWith } from "./toast";
import { E2E_PASSWORD, E2E_USERS } from "./users";

// Feature 105: while root requires two-factor of everyone, someone without it sees only
// /account/security, whatever they open or click. No root signs in for this one (root would be
// held too): the requirement is written to the instance's database, and put back.
const instance: Instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main;

const setRequirement = async (value: "optional" | "reviewers" | "everyone") => {
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

test("someone held for two-factor sees only /account/security, on every page and every click", async ({
  page,
}) => {
  await setRequirement("everyone");
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(E2E_USERS.twoFactorHeld);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Home after sign-in: held there.
    await expect(page).toHaveURL(/\/account\/security$/);
    await expect(page.getByText("Set up two-factor sign-in to continue")).toBeVisible();

    // A full load of another page.
    await page.goto("/catalogue");
    await expect(page).toHaveURL(/\/account\/security$/);

    // Clicks in the frame (client-side navigation, which doesn't render the layout again).
    const main = page.getByRole("navigation", { name: "Main" });
    for (const name of ["Home", "Catalogue", "Workspaces", "CLI & tokens"]) {
      await main.getByRole("link", { name, exact: true }).first().click();
      await expect(page).toHaveURL(/\/account\/security$/);
      await expect(page.getByText("Set up two-factor sign-in to continue")).toBeVisible();
    }
    await page
      .getByRole("navigation", { name: "Account" })
      .getByRole("link", { name: "Password" })
      .click();
    await expect(page).toHaveURL(/\/account\/security$/);
  } finally {
    await setRequirement("optional");
  }
});

/** Marks someone as having two-factor on, straight in the database (a record nothing can read). */
const markEnrolled = async (email: string, id: string) => {
  const { db, dialect } = createDb(instance.env.DATABASE_URL ?? "");
  try {
    const user = await db
      .selectFrom("user")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirstOrThrow();
    await db
      .updateTable("user")
      .set({ two_factor_enabled: toDbBoolean(true, dialect) })
      .where("id", "=", user.id)
      .execute();
    await db
      .insertInto("two_factor")
      .values({
        id,
        user_id: user.id,
        secret: "-",
        backup_codes: "-",
        verified: toDbBoolean(true, dialect),
      })
      .execute();
  } finally {
    await db.destroy();
  }
};

/** Takes it off again, whoever set it (the test, or the person enrolling). */
const unmark = async (email: string) => {
  const { db, dialect } = createDb(instance.env.DATABASE_URL ?? "");
  try {
    const user = await db
      .selectFrom("user")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirstOrThrow();
    await db.deleteFrom("two_factor").where("user_id", "=", user.id).execute();
    await db
      .updateTable("user")
      .set({ two_factor_enabled: toDbBoolean(false, dialect) })
      .where("id", "=", user.id)
      .execute();
  } finally {
    await db.destroy();
  }
};

// Root requires two-factor of reviewers on the Authentication tab, and is held at once (root is
// one); a moderator signing in then is held until they enrol, and free after. Root, marked enrolled
// in the database, sees the requirement on the tab (it crashed once under a requirement:
// docs/knowledge/server-client-props.md) and resets someone's on Admin › Users. A root of its own
// (twoFactorRoot), so root@e2e.test isn't signed in from a sixth file
// (docs/knowledge/e2e-sign-in-limit.md).
test("root requires it of reviewers, a moderator is held until enrolled, root resets someone", async ({
  page,
  browser,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.twoFactorRoot);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  try {
    await page.goto("/admin/settings?tab=authentication");
    await page.getByRole("radio", { name: /Reviewers and root/ }).check();
    // The save's own request, answered, before anything else is opened.
    await Promise.all([
      page.waitForResponse((response) => response.request().method() === "POST"),
      page
        .getByRole("form", { name: "Two-factor sign-in" })
        .getByRole("button", { name: "Save", exact: true })
        .click(),
    ]);
    // Root is covered and hasn't enrolled: held from the next page on.
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/account\/security$/);
    await expect(page.getByText("Set up two-factor sign-in to continue")).toBeVisible();

    // A moderator (of global, a shared workspace) signs in: held, enrols, and is let go.
    const context = await browser.newContext();
    try {
      const moderator = await context.newPage();
      await moderator.goto("/sign-in");
      await moderator.getByLabel("Email").fill(E2E_USERS.twoFactorModerator);
      await moderator.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
      await moderator.getByRole("button", { name: "Sign in" }).click();
      await expect(moderator).toHaveURL(/\/account\/security$/);
      await expect(moderator.getByText("Set up two-factor sign-in to continue")).toBeVisible();
      await moderator.getByLabel("Your password").fill(E2E_PASSWORD);
      await moderator.getByRole("button", { name: "Set up two-factor" }).click();
      const key = (await moderator.locator("code").first().innerText()).replace(/\s+/g, "");
      await moderator
        .getByLabel("Code from the app")
        .fill(totpCode(`otpauth://totp/x?secret=${key}`));
      await moderator.getByRole("button", { name: "Turn on" }).click();
      await moderator.getByRole("button", { name: "I've saved them" }).click();
      await moderator.goto("/catalogue");
      await expect(moderator).toHaveURL(/\/catalogue$/);
    } finally {
      await context.close();
    }

    // Root, marked enrolled, sees the requirement, and resets someone who has it on.
    await markEnrolled(E2E_USERS.twoFactorRoot, "e2e-root-enrolled");
    await markEnrolled(E2E_USERS.twoFactorResettable, "e2e-resettable-enrolled");
    await page.goto("/admin/settings?tab=authentication");
    await expect(page.getByText("Required for reviewers and root.")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Reviewers and root/ })).toBeChecked();
    await openUser(page, E2E_USERS.twoFactorResettable);
    await page.getByRole("button", { name: "Reset two-factor" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset two-factor" });
    await dialog.getByRole("button", { name: "Reset two-factor" }).click();
    await expect(
      toastWith(dialog, "Two-factor sign-in turned off. They’re signed out everywhere."),
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    // The page was refreshed: two-factor is off, so there is nothing to reset.
    await expect(page.getByRole("button", { name: "Reset two-factor" })).toHaveCount(0);
  } finally {
    await setRequirement("optional");
    for (const email of [
      E2E_USERS.twoFactorRoot,
      E2E_USERS.twoFactorModerator,
      E2E_USERS.twoFactorResettable,
    ])
      await unmark(email);
  }
});
