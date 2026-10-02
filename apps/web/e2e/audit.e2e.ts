import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_SKILL, E2E_USERS } from "./users";

// A reader in São Paulo (049): pages show times there, with UTC on hover.
test.use({ timezoneId: "America/Sao_Paulo" });

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Signed in: the page left /sign-in (the header shows the name, not the email).
  await expect(page).not.toHaveURL(/\/sign-in/);
};

/** Chooses a usage policy on Admin › Settings and saves it. */
const choosePolicy = async (page: Page, label: string) => {
  await page.getByRole("radio", { name: new RegExp(`^${label}`) }).check();
  const form = page.getByRole("form", { name: "Usage reporting" });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Usage reporting saved.")).toBeVisible();
};

// Root is the only root, and sign-in allows 5 attempts a minute per email, so root's admin pages
// share this one sign-in (docs/knowledge/e2e-sign-in-limit.md).
test("root reads the audit log: setup, its own sign-in, and a settings change", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.root);
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  const main = page.getByRole("navigation", { name: "Main" });
  const admin = page.getByRole("navigation", { name: "Admin" });
  const current = (nav: typeof main) => nav.locator('[aria-current="page"]');
  await expect(current(main)).toHaveText("Admin");
  await expect(current(admin)).toHaveText("Users");

  // Client-side navigation keeps the layouts mounted; the highlight must follow anyway.
  await admin.getByRole("link", { name: "Audit log" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect(current(admin)).toHaveText("Audit log");
  await expect(current(main)).toHaveText("Admin");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "instance.root_created" })).toHaveCount(1);
  await expect(
    rows.filter({ hasText: "auth.signed_in" }).filter({ hasText: E2E_USERS.root }).first(),
  ).toBeVisible();

  // One line per event, with a summary (060); the filters apply as they change.
  await expect(rows.filter({ hasText: "Created the first root account" })).toHaveCount(1);
  await page.getByLabel("Action").selectOption("instance.*");
  await expect(page).toHaveURL(/action=instance\.(\*|%2A)/);
  await expect(rows.filter({ hasText: "auth.signed_in" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "instance.root_created" })).toHaveCount(1);

  // The details open in a dialog with a URL of its own, and closing it keeps the view.
  await rows
    .filter({ hasText: "instance.root_created" })
    .getByRole("link", { name: /^Details:/ })
    .click();
  const details = page.getByRole("dialog", { name: "Event details" });
  await expect(details).toBeVisible();
  await expect(page).toHaveURL(/event=/);
  await expect(details.getByText(E2E_USERS.root).first()).toBeVisible();
  await expect(details.getByText("Raw JSON")).toBeVisible();
  await details.getByRole("button", { name: "Close" }).click();
  await expect(details).toBeHidden();
  await expect(page).not.toHaveURL(/event=/);
  await expect(page).toHaveURL(/action=instance/);

  // A chip removes its filter; the actor search finds events with no one signed in.
  await page.getByRole("link", { name: "Remove the action filter" }).click();
  await expect(page).not.toHaveURL(/action=/);
  await page.getByLabel("Actor").fill("system");
  await expect(page).toHaveURL(/actor=system/);
  await expect(rows.filter({ hasText: "auth.signed_in" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "instance.root_created" })).toHaveCount(1);
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);

  // Sorting by action from its header, and the page size, stay in the URL.
  await page.getByRole("link", { name: "Event" }).click();
  await expect(page).toHaveURL(/sort=action/);
  await expect(page.getByRole("columnheader", { name: "Event" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await page.getByLabel("Show").selectOption("25");
  await expect(page).toHaveURL(/size=25/);
  await expect(page).toHaveURL(/sort=action/);
  await expect(page.getByRole("navigation", { name: "Pages" })).toContainText(/\d+ events/);

  // Admin › Settings: root sets the usage policy (046); the change is audited.
  await admin.getByRole("link", { name: "Settings" }).click();
  await expect(current(admin)).toHaveText("Settings");
  await expect(page.getByRole("radio", { name: /^Off/ })).toBeChecked();
  await choosePolicy(page, "People choose");
  await page.reload();
  await expect(page.getByRole("radio", { name: /^People choose/ })).toBeChecked();
  await admin.getByRole("link", { name: "Audit log" }).click();
  await page.getByLabel("Action").selectOption("settings.*");
  await expect(page).toHaveURL(/action=settings/);
  await expect(rows.filter({ hasText: "settings.usage_policy" })).toHaveCount(1);
  await expect(
    rows.filter({ hasText: "Changed the usage policy from off to people choose" }),
  ).toHaveCount(1);
  // Back to a new instance's default, so other tests see an instance that collects nothing.
  await admin.getByRole("link", { name: "Settings" }).click();
  await choosePolicy(page, "Off");
  // The usage minimum (047): 0 by default; set, saved, then back to 0.
  const minimum = page.getByLabel("Show an item's usage from");
  await expect(minimum).toHaveValue("0");
  const saveMinimum = async (value: string) => {
    await minimum.fill(value);
    const form = page.getByRole("form", { name: "Usage minimum" });
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Usage minimum saved.")).toBeVisible();
  };
  await saveMinimum("5");
  await page.reload();
  await expect(minimum).toHaveValue("5");
  await saveMinimum("0");

  // Local time (049): the audit log and an item page in the reader's zone, UTC on hover.
  await admin.getByRole("link", { name: "Audit log" }).click();
  const firstTime = page.getByRole("row").nth(1).locator("time");
  await expect(firstTime).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} GMT-3$/);
  await expect(firstTime).toHaveAttribute("title", /UTC$/);
  await page.goto(`/items/${E2E_SCOPE}/${E2E_SKILL}`);
  await expect(page.locator("header time").first()).toHaveText(/ GMT-3$/);
  await page.goto("/admin/users");

  await admin.getByRole("link", { name: "Users" }).click();
  await expect(current(admin)).toHaveText("Users");
  await main.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(current(main)).toHaveText("Home");
});

test("anyone but root gets a 404", async ({ page }) => {
  await signIn(page, E2E_USERS.notRoot);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  const response = await page.goto("/admin/audit");
  expect(response?.status()).toBe(404);
  expect((await page.goto("/admin/settings"))?.status()).toBe(404);
});
