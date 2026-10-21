import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";

/**
 * Feature 129 on a phone and a tablet: the Menu, and the sheet it opens, follow the language. The
 * shared sign-in helper types the English labels, so the person signs in in English and then picks
 * French the way the sign-in page's links do: with the `ronne-locale` cookie.
 */
test("the Menu button and its sheet are in French", async ({ page, baseURL }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "languages"));
  await page.context().addCookies([{ name: "ronne-locale", value: "fr", url: baseURL ?? "/" }]);
  await page.reload();
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
