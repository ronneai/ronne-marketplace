import { expect, test } from "@playwright/test";
import { createDb } from "../src/server/db/create-db";
import { SIGN_UP_KEYS } from "../src/server/domains/settings/models/sign-up-policy";
import { kyselySettingsRepository } from "../src/server/domains/settings/repositories/kysely-settings-repository";
import type { Instance } from "./harness";
import { E2E_PASSWORD, E2E_USERS } from "./users";

const instance: Instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").main;

/** Root's terms, version 2026-11 asked of everyone (190), as the Self-registration panel saves it. */
const TERMS: Record<string, string> = {
  [SIGN_UP_KEYS.termsUrl]: "https://acme.example/terms",
  [SIGN_UP_KEYS.termsVersion]: "2026-11",
  [SIGN_UP_KEYS.termsRequiredVersion]: "2026-11",
};

const withDb = async (work: (db: ReturnType<typeof createDb>) => Promise<void>) => {
  const connection = createDb(instance.env.DATABASE_URL ?? "");
  try {
    await work(connection);
  } finally {
    await connection.db.destroy();
  }
};

test.beforeAll(async () => {
  await withDb(async ({ db, dialect }) => {
    const repo = kyselySettingsRepository(db, dialect);
    for (const [key, value] of Object.entries(TERMS)) await repo.set(key, value, null, new Date());
  });
});

test.afterAll(async () => {
  // Back to an instance that asks no terms, for the files after this one.
  await withDb(async ({ db }) => {
    await db.deleteFrom("instance_settings").where("key", "in", Object.keys(TERMS)).execute();
  });
});

test("someone signed in accepts the updated terms, then goes on to the page they asked for (190)", async ({
  page,
}) => {
  await page.goto("/sign-in?next=%2Fcatalogue");
  await page.getByLabel("Email").fill(E2E_USERS.terms);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/account\/terms\?next=%2Fcatalogue$/);
  await expect(page.getByRole("heading", { name: "Accept the updated terms" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Read the terms and privacy notice (version 2026-11)" }),
  ).toHaveAttribute("href", "https://acme.example/terms");
  // Any other page sends them back.
  await page.goto("/catalogue");
  await expect(page).toHaveURL(/\/account\/terms/);

  // Continue without the box: refused.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Tick the box to accept the terms, or sign out.")).toBeVisible();
  await page.getByLabel("I accept the updated terms and privacy notice").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/catalogue$/);

  // Accepted once: the page has nothing more to ask and sends them on.
  await page.goto("/account/terms");
  await expect(page).not.toHaveURL(/\/account\/terms/);
});
