import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_SCOPE, E2E_USERS, E2E_VERSIONED_ITEM } from "./users";

test("a moderator deprecates a version, yanks the latest one, then unyanks it", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.releaser);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto(`/items/${E2E_SCOPE}/${E2E_VERSIONED_ITEM}/versions`);
  await expect(
    page.getByRole("heading", { name: `@${E2E_SCOPE}/${E2E_VERSIONED_ITEM}` }),
  ).toBeVisible();
  await expect(page.getByText("latest → 1.1.0")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Installs, 30 days" })).toBeVisible();
  const row = (version: string) =>
    page.getByRole("row", { name: new RegExp(`^${version.replaceAll(".", "\\.")}\\b`) });

  // Deprecate 1.0.0 with a message.
  await row("1.0.0").getByRole("button", { name: "Deprecate", exact: true }).click();
  const deprecate = page.getByRole("dialog", { name: "Deprecate 1.0.0" });
  // What still uses it (047): the seed reports 25 installs of 1.0.0.
  await expect(
    deprecate.getByText("Reported in the last 30 days: 0 runs, 25 installs."),
  ).toBeVisible();
  await deprecate.getByLabel("Message").fill("Use 1.1.0 or later.");
  await deprecate.getByRole("button", { name: "Deprecate", exact: true }).click();
  await expect(row("1.0.0").getByText("Use 1.1.0 or later.")).toBeVisible();

  // Yank 1.1.0, the latest: latest moves back to 1.0.0.
  await row("1.1.0").getByRole("button", { name: "Yank", exact: true }).click();
  const yank = page.getByRole("dialog", { name: "Yank 1.1.0" });
  await yank.getByLabel("Reason").fill("Breaks on Windows.");
  await yank.getByRole("button", { name: "Yank", exact: true }).click();
  await expect(row("1.1.0").getByText(/Breaks on Windows\./)).toBeVisible();
  await expect(page.getByText("latest → 1.0.0")).toBeVisible();

  // Unyank it: installable again, and latest stays where it is.
  await row("1.1.0").getByRole("button", { name: "Unyank", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Unyank 1.1.0?" })
    .getByRole("button", { name: "Unyank", exact: true })
    .click();
  await expect(row("1.1.0").getByRole("button", { name: "Yank", exact: true })).toBeVisible();
  await expect(page.getByText("latest → 1.0.0")).toBeVisible();
});
