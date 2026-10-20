import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { downloadAfter } from "./helpers";
import { E2E_DATA, E2E_ERASE, E2E_PASSWORD, E2E_SCOPE, E2E_USERS } from "./users";

const signIn = async (page: Page, email: string) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
};

// Your data (104): a person downloads what the instance holds about them from Account.
test("a person downloads their data from Account, once every ten minutes, with a session only", async ({
  page,
}) => {
  await signIn(page, E2E_USERS.dataOwner);
  await page.goto("/account/password");
  const section = page.getByRole("region", { name: "Your data" });
  await expect(section).toBeVisible();
  await expect(section.getByText("Last downloaded")).toHaveCount(0);

  const file = await downloadAfter(page, () =>
    section.getByRole("link", { name: "Download my data" }).click(),
  );
  expect(file.suggestedFilename()).toMatch(/^ronne-data-[0-9A-Z]+-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(data).toMatchObject({ version: 1, account: { email: E2E_USERS.dataOwner } });
  expect(data.items.map((i: { name: string }) => i.name)).toContain(
    `@${E2E_SCOPE}/${E2E_DATA.item}`,
  );
  expect(data.comments.map((c: { body: string }) => c.body)).toContain(E2E_DATA.comment);
  expect(data.sessions.length).toBeGreaterThan(0);
  // Nobody else's data: the erasable person's comment on the same review isn't here.
  expect(JSON.stringify(data)).not.toContain(E2E_ERASE.comment);

  // The page says when, the second one is refused with the time left, and a token is no way in.
  await page.goto("/account/password");
  await expect(page.getByRole("region", { name: "Your data" })).toContainText("Last downloaded");
  const again = await page.request.get("/account/data");
  expect(again.status()).toBe(429);
  expect(Number(again.headers()["retry-after"])).toBeGreaterThan(0);
  const token = await page.request.get("/account/data", {
    headers: { authorization: "Bearer rmk_not_a_real_token" },
  });
  expect(token.status()).toBe(401);
});
