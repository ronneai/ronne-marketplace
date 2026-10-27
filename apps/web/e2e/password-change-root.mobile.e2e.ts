import { expect, test } from "@playwright/test";
import { mobileUser, signIn } from "./mobile";
import { describeOverflow, measureOverflow, overflows } from "./sweep";

/**
 * Feature 128 on a phone and a tablet: Create user offers "Ask them to choose a new password when
 * they sign in", checked, with a tap target a thumb can hit, and in French (the longest text) the
 * dialog still fits the screen.
 */
test("the Create user dialog's password box fits and is a touch target, in English and French", async ({
  page,
  baseURL,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "root"));
  for (const [locale, button, box] of [
    ["en", "Create user", "Ask them to choose a new password when they sign in"],
    [
      "fr",
      "Créer un utilisateur",
      "Leur demander de choisir un nouveau mot de passe à la connexion",
    ],
  ] as const) {
    if (locale === "fr")
      await page
        .context()
        .addCookies([{ name: "ronne-locale", value: locale, url: baseURL ?? "/" }]);
    await page.goto("/admin/users");
    await page.getByRole("button", { name: button }).first().click();
    const dialog = page.getByRole("dialog");
    const checkbox = dialog.getByRole("checkbox", { name: box });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
    // The row, not just the box, is the target: 44px tall on a touch screen.
    const row = await checkbox.locator("xpath=ancestor::div[1]").boundingBox();
    expect(row?.height ?? 0, `${locale}: the row is a touch target`).toBeGreaterThanOrEqual(44);
    // The 44px comes from the row's own minimum height, not from its content wrapping.
    const minHeight = await checkbox.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el.closest("div") as HTMLElement).minHeight),
    );
    expect(minHeight, `${locale}: the row has a minimum height`).toBeGreaterThanOrEqual(44);
    // Nothing in the dialog scrolls sideways either (measureOverflow ignores a framed scroller).
    // Neither the dialog nor the box's row scrolls sideways (measureOverflow ignores a framed
    // scroller). The form is not checked: its bottom bar bleeds to the edges on purpose.
    const sideways = await dialog.evaluate((root) =>
      [root, ...root.querySelectorAll("[type=checkbox]")]
        .flatMap((el) => [el, el.closest("div")])
        .filter((el): el is Element => el !== null && el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.tagName}.${String(el.className)} ${el.scrollWidth}>${el.clientWidth}`),
    );
    expect(sideways, `${locale}: nothing in the dialog scrolls sideways`).toEqual([]);
    const overflow = await measureOverflow(page);
    expect(overflows(overflow), `${locale}: ${describeOverflow(overflow)}`).toBe(false);
    await page.keyboard.press("Escape");
  }
});
