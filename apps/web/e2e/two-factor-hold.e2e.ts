import { expect, test } from "@playwright/test";
import { createDb } from "../src/server/db/create-db";
import { toDbBoolean, toDbDate } from "../src/server/db/dates";
import type { Instance } from "./harness";
import { E2E_PASSWORD, E2E_USERS } from "./users";

// Feature 105: while root requires two-factor of everyone, someone without it sees only
// /account/security, whatever they open or click. Root isn't signed in (the sign-in limit, and
// root would be held too): the requirement is written to the instance's database, and put back.
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

// The Authentication tab reads the requirement's name for Sign-in methods, from a list a client
// component also uses: under Optional that line isn't read, so this opens the tab under a
// requirement (it crashed once: docs/knowledge/server-client-props.md). Root has to be enrolled
// not to be held: marked so in the database after signing in, and put back.
test("root sees the Authentication tab with a requirement set", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.root);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  const { db, dialect } = createDb(instance.env.DATABASE_URL ?? "");
  const root = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", E2E_USERS.root)
    .executeTakeFirstOrThrow();
  try {
    await db
      .updateTable("user")
      .set({ two_factor_enabled: toDbBoolean(true, dialect) })
      .where("id", "=", root.id)
      .execute();
    await db
      .insertInto("two_factor")
      .values({
        id: "e2e-root-enrolled",
        user_id: root.id,
        secret: "-",
        backup_codes: "-",
        verified: toDbBoolean(true, dialect),
      })
      .execute();
    await setRequirement("reviewers");
    await page.goto("/admin/settings?tab=authentication");
    await expect(page.getByText("Required for reviewers and root.")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Reviewers and root/ })).toBeChecked();
  } finally {
    await setRequirement("optional");
    await db.deleteFrom("two_factor").where("id", "=", "e2e-root-enrolled").execute();
    await db
      .updateTable("user")
      .set({ two_factor_enabled: toDbBoolean(false, dialect) })
      .where("id", "=", root.id)
      .execute();
    await db.destroy();
  }
});
