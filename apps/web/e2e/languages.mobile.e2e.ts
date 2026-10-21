import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";

/** Feature 129 on a phone and a tablet: the Menu, and the sheet it opens, follow the browser's language. */
test.use({ locale: "fr-CA" });

test("the Menu button and its sheet are in French", async ({ page }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "languages"));
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.getByRole("button", { name: /^Menu/ }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  for (const name of ["Accueil", "Catalogue", "Espaces de travail", "Révisions", "Soumissions"])
    await expect(sheet.getByRole("link", { name })).toBeVisible();
  await expect(sheet.getByText("Gouvernance et révisions")).toBeVisible();
  await expect(sheet.getByText("Apparence")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Fermer" })).toBeVisible();
});
