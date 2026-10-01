import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_RMK_ITEMS, E2E_SCOPE, E2E_SKILL, E2E_USERS } from "./users";

test("a user searches from the home page, filters by type, reads a skill's contents and README, and copies the install command", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.browser);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  // The home page lists what's new, and its search box leads into the catalogue.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recently published" })).toBeVisible();
  await page.getByLabel("Search the catalogue").fill("security");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/catalogue\?q=security/);
  await page
    .getByRole("navigation", { name: "Types" })
    .getByRole("link", { name: /^skill/ })
    .click();
  await expect(page).toHaveURL(/type=skill/);

  const name = `@${E2E_SCOPE}/${E2E_SKILL}`;
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText("license MIT · #security · #owasp")).toBeVisible();

  // Overview (044): the skill's SKILL.md as released, rendered, with its frontmatter, and its
  // exact source a tab away.
  const nav = page.getByRole("navigation", { name: "Item" });
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  const skill = page.getByRole("region", { name: "SKILL.md" });
  await expect(skill.getByRole("heading", { name: "Scanning for secrets" })).toBeVisible();
  await expect(skill.getByLabel("Frontmatter")).toContainText(E2E_SKILL);
  await skill.getByRole("tab", { name: "Source" }).click();
  await expect(skill.getByText("# Scanning for secrets")).toBeVisible();

  const install = page
    .locator("section, div")
    .filter({ hasText: /^Install/ })
    .first();
  await install.getByRole("button", { name: "copy" }).first().click();
  await expect(install.getByText("copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`rmk install ${name}`);

  // The other tabs are links of their own.
  await nav.getByRole("link", { name: "README" }).click();
  await expect(page.getByRole("heading", { name: "Secret scanner" })).toBeVisible();

  // Files: every file as released; the selection is in the URL, so it can be linked.
  await nav.getByRole("link", { name: "Files" }).click();
  const files = page.getByRole("navigation", { name: "Files of this version" });
  await expect(files.getByRole("button", { name: /SKILL\.md/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await files.getByRole("button", { name: /ronne\.yaml/ }).click();
  await expect(page).toHaveURL(/file=ronne\.yaml/);
  const manifest = page.getByRole("region", { name: "ronne.yaml" });
  await expect(manifest.getByText("version: 1.0.0")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "ronne.yaml" })).toBeVisible();
});

test("an agent's Overview shows its prompt, its settings and its dependencies on a read-only canvas", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.browser);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto(`/items/${E2E_SCOPE}/${E2E_RMK_ITEMS.agent}`);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("fast", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "prompt.md" }).getByText("Review with the kit."),
  ).toBeVisible();
  // The other files are on the left, as in Files.
  await page
    .getByRole("navigation", { name: "Files of this version" })
    .getByRole("button", { name: /ronne\.yaml/ })
    .click();
  await expect(page).toHaveURL(/file=ronne\.yaml/);
  await expect(
    page.getByRole("region", { name: "ronne.yaml" }).getByText("model: fast"),
  ).toBeVisible();

  const canvas = page.getByRole("region", { name: "Dependencies" });
  await expect(canvas.getByRole("heading", { name: "Uses 2 items" })).toBeVisible();
  const mcp = `@${E2E_SCOPE}/${E2E_RMK_ITEMS.mcp}`;
  const nodes = canvas.locator(".react-flow__node-dependency");
  await expect(nodes).toHaveCount(2);
  // Read-only: nothing to remove, no range to type, no catalogue to add from.
  await expect(canvas.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  await expect(canvas.getByLabel(`Range of ${mcp}`)).toBeDisabled();
  await expect(page.getByRole("region", { name: "Add from the catalogue" })).toHaveCount(0);

  await nodes.getByRole("link", { name: mcp }).click();
  await expect(page.getByRole("heading", { level: 1, name: mcp })).toBeVisible();
  await expect(page.getByText("KIT_TOKEN (required, secret)")).toBeVisible();
});
