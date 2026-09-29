import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_PROPOSAL_ITEM, E2E_SCOPE, E2E_USERS } from "./users";

test("a token made in the web app reads the registry and downloads an item, which counts on the home page", async ({
  page,
  request,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.downloader);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto("/account/tokens");
  await page.getByRole("button", { name: "Create token" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("e2e rmk");
  await dialog.getByRole("button", { name: "Create token" }).click();
  const token = (await dialog.locator("code").first().innerText()).trim();
  const auth = { authorization: `Bearer ${token}` };

  // `request` has no cookies: only the token counts.
  const search = await request.get(`/api/v1/items?q=${E2E_PROPOSAL_ITEM}`, { headers: auth });
  expect(search.status()).toBe(200);
  const name = `@${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}`;
  expect((await search.json()).items.map((i: { name: string }) => i.name)).toContain(name);

  const item = await request.get(`/api/v1/items/${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}`, {
    headers: auth,
  });
  const version = (await item.json()).versions.at(-1);
  expect(version.version).toBe("1.0.0");

  const tarball = await request.get(
    `/api/v1/items/${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}/1.0.0/tarball`,
    { headers: auth },
  );
  expect(tarball.status()).toBe(200);
  expect(tarball.headers()["x-checksum-sha256"]).toBe(version.sha256);
  expect((await tarball.body()).length).toBe(version.size);
  const anonymous = await request.get(
    `/api/v1/items/${E2E_SCOPE}/${E2E_PROPOSAL_ITEM}/1.0.0/tarball`,
  );
  expect(anonymous.status()).toBe(401);

  // The home page's Most used shows it, with its count.
  await page.goto("/");
  const mostUsed = page.getByRole("region", { name: "Most used" });
  const card = mostUsed
    .getByRole("article")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(card).toBeVisible();
  // At least this download; other tests (such as rmk-mcp's) may have downloaded it too.
  await expect(card.getByText(/\b[1-9]\d* downloads?\b/)).toBeVisible();
});
