import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

test("create a token, use it on the API, revoke it, and it stops working", async ({
  page,
  request,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.tokens);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(E2E_USERS.tokens, { exact: true })).toBeVisible();

  await page.goto("/account/tokens");
  await expect(page.getByRole("heading", { name: "Access tokens" })).toBeVisible();
  await page.getByRole("button", { name: "Create token" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("e2e laptop");
  await dialog.getByRole("button", { name: "Create token" }).click();
  await expect(dialog.getByText("Copy it now")).toBeVisible();
  const token = (await dialog.locator("code").first().innerText()).trim();
  expect(token).toMatch(/^rmk_[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("cell", { name: "e2e laptop", exact: true })).toBeVisible();

  // `request` is a separate context with no cookies: only the bearer token counts.
  const auth = { authorization: `Bearer ${token}` };
  const me = await request.get("/api/v1/me", { headers: auth });
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ email: E2E_USERS.tokens, token: { name: "e2e laptop" } });

  await page.getByRole("button", { name: "Revoke e2e laptop" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke token" }).click();
  // The page refreshes: the row says revoked, and its revoke button (and dialog) are gone.
  await expect(page.getByRole("row").filter({ hasText: "e2e laptop" })).toContainText("revoked");
  await expect(page.getByRole("button", { name: "Revoke e2e laptop" })).toHaveCount(0);

  const after = await request.get("/api/v1/me", { headers: auth });
  expect(after.status()).toBe(401);
  expect(after.headers()["www-authenticate"]).toContain("Bearer");
  expect(await after.json()).toMatchObject({ error: { code: "token_revoked" } });
});

test("the API ignores a signed-in browser's cookies", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.tokens);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(E2E_USERS.tokens, { exact: true })).toBeVisible();
  const response = await page.request.get("/api/v1/me");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "token_missing" } });
});
