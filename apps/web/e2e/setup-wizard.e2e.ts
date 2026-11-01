import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { headerName } from "./helpers";
import { E2E_SETUP_PASSWORD } from "./users";

// The web setup (feature 036), with JavaScript: the wizard, on an instance that isn't set up yet.
const instance = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}").wizard as { dir: string };
const root = { email: "root@e2e.test", name: "Root", password: E2E_SETUP_PASSWORD };

test("sets the instance up from the browser, then signs in", async ({ page, request }) => {
  // Until it's ready, every page ends on the setup, and the API says so.
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Set up Ronne AI Marketplace" })).toBeVisible();
  expect((await request.get("/api/health")).status()).toBe(503);
  expect((await request.get("/api/v1/me")).status()).toBe(503);

  // Before the install, the page says the instance isn't set up, and who can finish it.
  const notSetUp = page.getByText("This instance isn’t set up yet", { exact: false });
  const warning = page.getByText("Setting this instance up takes its setup code");
  await expect(notSetUp).toBeVisible();
  await expect(warning).toBeVisible();

  // 1. The setup code (161), which the server made at its start, in its data folder; then the
  // database. An absolute path: a relative one would be resolved under apps/web.
  const wizard = page.locator('form[data-setup="wizard"]');
  await expect(wizard).toBeVisible();
  await expect(page.getByText("terminal", { exact: false })).toHaveCount(0);
  const code = readFileSync(join(instance.dir, "setup-code"), "utf8").trim();
  const codeField = page.getByLabel("Setup code", { exact: true });
  await expect(codeField).toHaveValue("");
  await page.locator('select[name="database.kind"]').selectOption("sqlite");
  await page.locator('input[name="database.path"]').fill(join(instance.dir, "ronne.db"));
  // Without the code, nothing runs: the error is at the field.
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(
    page.getByText("That isn’t this server’s setup code.", { exact: false }),
  ).toBeVisible();
  await expect(codeField).toHaveAttribute("aria-invalid", "true");
  // The install script's link fills it, and the code leaves the address bar.
  await page.goto(`/setup#code=${code.toLowerCase().replace(/(.{5})(?!$)/g, "$1-")}`);
  await expect(codeField).toHaveValue(code.toLowerCase().replace(/(.{5})(?!$)/g, "$1-"));
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.locator('select[name="database.kind"]').selectOption("sqlite");
  await page.locator('input[name="database.path"]').fill(join(instance.dir, "ronne.db"));
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Connected to SQLite and checked permissions")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  // 2. Instance.
  await expect(page.getByLabel("Public address (PUBLIC_URL)")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  // 3. Root account.
  await page.locator('input[name="root.email"]').fill(root.email);
  await page.locator('input[name="root.name"]').fill(root.name);
  await page.locator('input[name="root.password"]').fill(root.password);
  await page.locator('input[name="root.password_again"]').fill(root.password);
  await page.getByRole("button", { name: "Install" }).click();

  // 4. Install: three steps, then sign in with the email filled in.
  const steps = page.locator("li[data-step]");
  await expect(steps.filter({ has: page.locator('[data-status="done"]') })).toHaveCount(0);
  await expect(page.locator('li[data-step="settings"]')).toHaveAttribute("data-status", "done");
  await expect(page.locator('li[data-step="migrations"]')).toHaveAttribute("data-status", "done");
  await expect(page.locator('li[data-step="root"]')).toHaveAttribute("data-status", "done");
  await expect(page.getByText("Ronne AI Marketplace is set up")).toBeVisible();
  // Finished: neither the not-set-up sentence nor the warning stays (#148).
  await expect(notSetUp).toHaveCount(0);
  await expect(warning).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\?email=root%40e2e\.test$/);
  await expect(page.getByLabel("Email")).toHaveValue(root.email);
  await page.getByLabel("Password", { exact: true }).fill(root.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(headerName(page, root.name)).toBeVisible();

  // A new instance has nothing released: Home says so and points root at a scope first (124).
  await expect(page.getByRole("heading", { name: "Nothing is published yet." })).toBeVisible();
  await expect(page.getByText("Start here: create a scope for your items")).toBeVisible();
  await expect(page.getByRole("link", { name: "Submit the first item" })).toHaveAttribute(
    "href",
    "/submissions/new",
  );
  await page.getByRole("link", { name: "Create a scope" }).click();
  await expect(page).toHaveURL(/\/workspaces\/global$/);
  await page.goto("/");

  // The code is gone with the setup (161).
  expect(() => readFileSync(join(instance.dir, "setup-code"))).toThrow(/ENOENT/);

  // Ready: the setup only redirects, the API answers, and the audit log has the one root event.
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/$/);
  expect((await request.get("/api/health")).status()).toBe(200);
  await page.goto("/admin/audit");
  await expect(page.getByRole("row").filter({ hasText: "instance.root_created" })).toHaveCount(1);
});
