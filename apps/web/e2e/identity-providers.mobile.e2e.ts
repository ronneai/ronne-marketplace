import { expect, type Page, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { describeOverflow, measureOverflow, overflows } from "./sweep";

/**
 * Feature 106 at phone width (065's sweep only opens pages as they load): the preset cards, the
 * form with its steps under it, and the group rows, without the page scrolling sideways.
 */
const noSidewaysScroll = async (page: Page, where: string) => {
  const o = await measureOverflow(page);
  expect(overflows(o), `${where}: ${describeOverflow(o)}`).toBe(false);
};

test("the identity provider form fits a phone: cards, fields, steps, group rows and SCIM", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "root"));
  const id = `kc-${testInfo.project.name}`.slice(0, 32);
  await page.goto("/admin/settings?tab=authentication&provider=new");
  await expect(page.getByRole("heading", { name: "Choose your identity provider" })).toBeVisible();
  await noSidewaysScroll(page, "the preset cards");

  // A card is a client navigation: the preset's defaults are filled in all the same.
  await page.getByRole("link", { name: /^Google Workspace/ }).click();
  await expect(page.getByLabel("Provider id")).toHaveValue("google");
  await expect(page.getByLabel("Issuer URL")).toHaveValue("https://accounts.google.com");
  await expect(page.getByText(/\/api\/auth\/sso\/callback\/google$/).first()).toBeVisible();
  await page.goBack();

  await page.getByRole("link", { name: /^Keycloak/ }).click();
  await expect(page.getByLabel("Provider id")).toHaveValue("keycloak");
  await page.getByLabel("Provider id").fill(id);
  await page.getByLabel("Keycloak address").fill("sso.acme.internal");
  await page.getByLabel("Realm").fill("acme");
  await expect(page.getByLabel("Issuer URL")).toHaveValue("https://sso.acme.internal/realms/acme");
  await page.getByLabel("Client ID").fill("ronne");
  await page.getByLabel("Client secret").fill("phone-test-secret");
  await expect(page.getByRole("heading", { name: "Set it up at the provider" })).toBeVisible();
  await noSidewaysScroll(page, "the new provider's form and steps");

  await page.getByRole("button", { name: "Add provider" }).click();
  await expect(page).toHaveURL(new RegExp(`provider=${id}$`));
  await expect(page.getByText("Secret saved")).toBeVisible();
  await expect(page.getByText(`/api/auth/sso/callback/${id}`).first()).toBeVisible();

  await page.getByRole("button", { name: "Add a group" }).click();
  await page.getByLabel("Group", { exact: true }).fill("engineering");
  await page.getByLabel("Workspace", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Role", { exact: true }).selectOption("moderator");
  await noSidewaysScroll(page, "the edit form with a group row");
  await expect(page.getByRole("button", { name: "Turn on", exact: true })).toBeDisabled();

  // Provisioning (SCIM, 108): turn it on, make the token, and the section still fits.
  await page.getByRole("button", { name: "Turn on SCIM" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Turn on SCIM" }).click();
  await expect(page.getByText(/\/api\/v1\/scim\/v2$/).first()).toBeVisible();
  await page.getByRole("button", { name: "Generate token" }).click();
  await expect(page.getByText("Copy the token now")).toBeVisible();
  await expect(page.getByText(/^scim_[A-Za-z0-9_-]{43}$/)).toBeVisible();
  await noSidewaysScroll(page, "the SCIM section with a new token");

  // Leave the instance as it was.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete provider" }).click();
  await expect(page).toHaveURL(/tab=authentication$/);
});
