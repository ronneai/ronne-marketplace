import { expect, type Page } from "@playwright/test";
import { E2E_SCOPE, E2E_VERSIONED_ITEM } from "./users";

/**
 * Issue #143, on every screen: the dependency menu says what each row writes and accepts, and
 * offers an exact pin. The signed-in page makes an agent draft named `item`, picks the seed's item
 * published as 1.0.0 and 1.1.0, chooses Exactly → 1.0.0, saves, and finds the bare 1.0.0 in
 * ronne.yaml, then, opened again, the row's words. Which version is `latest` depends on what ran
 * before: versions.e2e.ts yanks and moves it on desktop.
 */
export const pinAnExactVersion = async (page: Page, item: string) => {
  await page.goto("/submissions/new");
  await page
    .locator("label")
    .filter({ has: page.locator(`input[name="scope"][value="${E2E_SCOPE}"]`) })
    .click();
  await page.getByLabel("Name").fill(item);
  await page
    .locator("label")
    .filter({ has: page.locator('input[name="type"][value="agent"]') })
    .click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/submissions\/[0-9A-Z]{26}$/);

  const dependency = `@${E2E_SCOPE}/${E2E_VERSIONED_ITEM}`;
  const search = page.getByRole("combobox", { name: "Add a dependency" });
  await search.fill(dependency);
  const list = page.getByRole("listbox", { name: "Items to depend on" });
  await list.getByRole("option", { name: new RegExp(dependency) }).click();

  // It starts on latest's caret range, labelled with what it writes and accepts.
  const version = page.getByLabel(`Version of ${dependency}`);
  await expect(version).toHaveValue(/^\^1\.[01]\.0$/);
  const latest = (await version.inputValue()).slice(1);
  await expect(version.locator("option:checked")).toHaveText(
    `^${latest} · ${latest} or later 1.x, latest`,
  );
  await expect(version.locator('optgroup[label="Exactly"] option').last()).toHaveText(
    "1.0.0 · exactly 1.0.0",
  );
  await version.selectOption("1.0.0");
  await expect(version.locator("option:checked")).toHaveText("1.0.0 · exactly 1.0.0");

  // The bare version, which only 1.0.0 matches, and the form and YAML agree.
  await page.getByRole("button", { name: "YAML", exact: true }).click();
  const yaml = page.getByLabel("Contents of ronne.yaml");
  await expect(yaml).toContainText(new RegExp(`"${dependency}": "?1\\.0\\.0"?(?!\\.)`));
  await expect(yaml).not.toContainText("^1.0.0");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

  // Opened again, the row has no menu: it says what its range accepts, in the menu's words.
  await page.reload();
  await page.getByRole("button", { name: "Form", exact: true }).click();
  await expect(page.getByLabel(`Range of ${dependency}`)).toHaveValue("1.0.0");
  await expect(page.getByText("1.0.0 · exactly 1.0.0")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
};
