import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import {
  E2E_DOOR,
  E2E_PASSWORD,
  E2E_PINS,
  E2E_SCOPE,
  E2E_SHELVES,
  E2E_SKILL,
  E2E_USERS,
  E2E_VAULT,
} from "./users";

/**
 * Feature 125 on a desktop browser: favorites (a star on a card and an item page, Home's shelf and
 * the catalogue's filter, also with JavaScript off), Start here (root's), a workspace's pinned items
 * (its admin's; its members see them as their current workspace), and what a person who can't see
 * an item never gets. Each person signs in once (docs/knowledge/e2e-sign-in-limit.md).
 */
type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
const sessions: Partial<Record<keyof typeof E2E_USERS, State>> = {};
const PEOPLE = [
  "favoriter",
  "favoriterNoJs",
  "shelvesAdmin",
  "shelvesMember",
  "shelvesVault",
  "shelvesOutsider",
  "shelvesRoot",
] as const;

test.beforeAll(async ({ browser, baseURL }) => {
  for (const key of PEOPLE) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(E2E_USERS[key]);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/$/);
    sessions[key] = await context.storageState();
    await context.close();
  }
});

const as = async (
  browser: Browser,
  baseURL: string | undefined,
  key: (typeof PEOPLE)[number],
  options: { javaScriptEnabled?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> => {
  const context = await browser.newContext({ baseURL, storageState: sessions[key], ...options });
  return { context, page: await context.newPage() };
};

const SKILL = `@${E2E_SCOPE}/${E2E_SKILL}`;
const skillPage = `/items/${E2E_SCOPE}/${E2E_SKILL}`;
const SHELF_ITEM = `@${E2E_SHELVES.workspace}/${E2E_SHELVES.scope}/${E2E_SHELVES.item}`;
const shelfItemPage = `/workspaces/${E2E_SHELVES.workspace}/items/${E2E_SHELVES.scope}/${E2E_SHELVES.item}`;
const DOOR_ITEM = `@${E2E_DOOR.workspace}/${E2E_DOOR.scope}/${E2E_DOOR.item}`;
const doorPage = `/workspaces/${E2E_DOOR.workspace}/items/${E2E_DOOR.scope}/${E2E_DOOR.item}`;
/** The item the seed pins to Start here. */
const PIN_NOTES = `@${E2E_PINS.workspace}/${E2E_PINS.scope}/${E2E_PINS.item}`;
const VAULT_ITEM = `@${E2E_VAULT.workspace}/${E2E_VAULT.scope}/${E2E_VAULT.item}`;
const vaultPage = `/workspaces/${E2E_VAULT.workspace}/items/${E2E_VAULT.scope}/${E2E_VAULT.item}`;

const add = /^Add .+ to favorites$/;
const remove = /^Remove .+ from favorites$/;
const region = (page: Page, name: string) => page.getByRole("region", { name });
/** The cards of a shelf, in order, by their names. */
const names = (shelf: Locator) => shelf.getByRole("heading", { level: 3 });

/**
 * Once all have run, leaves the shared instance as it was found, whatever a failed test left (later tests, and
 * the phone sweep, run against the same instance): no favorite of the two who star, Start here with
 * only the seed's item, and the workspace's shelf empty. Each step looks before it acts.
 */
test.afterAll(async ({ browser, baseURL }) => {
  for (const key of ["favoriter", "favoriterNoJs"] as const) {
    const { context, page } = await as(browser, baseURL, key, { javaScriptEnabled: false });
    await page.goto(skillPage);
    if (await page.getByRole("button", { name: remove }).count())
      await page.getByRole("button", { name: remove }).click();
    await context.close();
  }
  const { context, page } = await as(browser, baseURL, "shelvesRoot");
  const clear = async (path: string, manage: string, keep: string[]) => {
    await page.goto(path);
    const button = page.getByRole("button", { name: manage });
    if (!(await button.count())) return;
    await button.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/ of 12 pinned$/)).toBeVisible();
    for (;;) {
      const removals = await dialog
        .getByRole("button", { name: /^Remove / })
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label") ?? ""));
      const next = removals.find((label) => !keep.some((name) => label === `Remove ${name}`));
      if (!next) break;
      await dialog.getByRole("button", { name: next, exact: true }).click();
      if (removals.length === 1) break;
      await expect(dialog.getByRole("button", { name: next, exact: true })).toHaveCount(0);
    }
    await page.reload();
  };
  await clear("/", "Manage Start here", [PIN_NOTES]);
  await clear(`/workspaces/${E2E_SHELVES.workspace}`, `Manage ${E2E_SHELVES.workspace}`, []);
  await context.close();
});

test.describe("favorites", () => {
  test("a star on a card and on the item page: Home's shelf, the Favorites filter, and only the owner's", async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await as(browser, baseURL, "favoriter");
    await page.goto("/");
    await expect(region(page, "Your favorites")).toHaveCount(0);

    await page.goto(`/catalogue?q=${E2E_SKILL}`);
    const card = page.getByRole("article").filter({ hasText: SKILL });
    await card.getByRole("button", { name: add }).click();
    await expect(card.getByRole("button", { name: remove })).toBeVisible();
    await expect(card.getByRole("button", { name: remove })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Home shows it, with See all into the catalogue's Favorites filter.
    await page.goto("/");
    const favorites = region(page, "Your favorites");
    await expect(names(favorites)).toHaveText([SKILL]);
    await favorites.getByRole("link", { name: "See all" }).click();
    await expect(page).toHaveURL(/\/catalogue\?favorites=1$/);
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText(SKILL);
    await expect(page.getByRole("link", { name: "Remove the favorites filter" })).toBeVisible();
    // The filter keeps the search: nothing matches another name.
    await page.goto("/catalogue?favorites=1&q=nothing-like-this");
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.goto(`/catalogue?favorites=1&q=${E2E_SKILL}`);
    await expect(page.getByRole("article")).toHaveCount(1);
    // The chip takes the filter off, keeping the search.
    await page.getByRole("link", { name: "Remove the favorites filter" }).click();
    await expect(page).not.toHaveURL(/favorites=1/);
    await expect(page.getByRole("link", { name: "Remove the favorites filter" })).toHaveCount(0);

    // The item page's star shows it too, and unstarring there takes it off Home.
    await page.goto(skillPage);
    await expect(page.getByRole("button", { name: remove })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: remove }).click();
    await expect(page.getByRole("button", { name: add })).toHaveAttribute("aria-pressed", "false");
    await page.goto("/");
    await expect(region(page, "Your favorites")).toHaveCount(0);
    await context.close();
  });

  test("nobody else sees them, root included", async ({ browser, baseURL }) => {
    const mine = await as(browser, baseURL, "favoriter");
    await mine.page.goto(skillPage);
    await mine.page.getByRole("button", { name: add }).click();
    await expect(mine.page.getByRole("button", { name: remove })).toBeVisible();
    for (const key of ["shelvesOutsider", "shelvesRoot"] as const) {
      const other = await as(browser, baseURL, key);
      await other.page.goto("/");
      await expect(region(other.page, "Your favorites")).toHaveCount(0);
      await other.page.goto("/catalogue?favorites=1");
      await expect(other.page.getByRole("article")).toHaveCount(0);
      await other.page.goto(skillPage);
      await expect(other.page.getByRole("button", { name: add })).toBeVisible();
      await other.context.close();
    }
    // Clean up for the next run.
    await mine.page.getByRole("button", { name: remove }).click();
    await expect(mine.page.getByRole("button", { name: add })).toBeVisible();
    await mine.context.close();
  });

  test("the star works with JavaScript off: it is a form", async ({ browser, baseURL }) => {
    const { context, page } = await as(browser, baseURL, "favoriterNoJs", {
      javaScriptEnabled: false,
    });
    await page.goto(skillPage);
    await page.getByRole("button", { name: add }).click();
    await expect(page.getByRole("button", { name: remove })).toBeVisible();
    await expect(page.getByRole("button", { name: remove })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.goto("/");
    await expect(names(region(page, "Your favorites"))).toHaveText([SKILL]);
    await page.goto(skillPage);
    await page.getByRole("button", { name: remove }).click();
    await expect(page.getByRole("button", { name: add })).toBeVisible();
    await context.close();
  });
});

test.describe("pins", () => {
  test.describe.configure({ mode: "serial" });

  test("root pins to Start here and orders it; everyone sees it on Home; others cannot manage it", async ({
    browser,
    baseURL,
  }) => {
    const root = await as(browser, baseURL, "shelvesRoot");
    await root.page.goto(doorPage);
    await root.page.getByRole("button", { name: "Pin", exact: true }).click();
    const dialog = root.page.getByRole("dialog");
    const start = dialog.getByRole("listitem").filter({ hasText: "Start here" });
    await start.getByRole("button", { name: `Pin ${DOOR_ITEM} to Start here` }).click();
    await expect(start.getByText("Pinned", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // On Home it follows the seeded Start here item, and root can manage it.
    await root.page.goto("/");
    const shelf = region(root.page, "Start here");
    await expect(names(shelf)).toHaveText([PIN_NOTES, DOOR_ITEM]);
    await shelf.getByRole("button", { name: "Manage Start here" }).click();
    const manage = root.page.getByRole("dialog");
    await expect(manage.getByText("2 of 12 pinned")).toBeVisible();
    await manage.getByRole("button", { name: `Move ${DOOR_ITEM} up` }).click();
    await expect(manage.getByRole("listitem").locator("span.font-mono")).toHaveText([
      DOOR_ITEM,
      PIN_NOTES,
    ]);
    await manage.getByRole("button", { name: "Done" }).click();
    await root.page.reload();
    await expect(names(region(root.page, "Start here"))).toHaveText([DOOR_ITEM, PIN_NOTES]);

    // A member sees the same order, without Manage.
    const member = await as(browser, baseURL, "shelvesMember");
    await member.page.goto("/");
    await expect(names(region(member.page, "Start here"))).toHaveText([DOOR_ITEM, PIN_NOTES]);
    await expect(member.page.getByRole("button", { name: "Manage Start here" })).toHaveCount(0);
    // And their Pin menu has no Start here.
    await member.page.goto(doorPage);
    await member.page.getByRole("button", { name: "Pin", exact: true }).click();
    await expect(
      member.page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Start here" }),
    ).toHaveCount(0);
    await member.context.close();

    // Root unpins it again, from Manage.
    await root.page.goto("/");
    await region(root.page, "Start here")
      .getByRole("button", { name: "Manage Start here" })
      .click();
    await root.page.getByRole("button", { name: `Remove ${DOOR_ITEM}` }).click();
    await expect(root.page.getByText("1 of 12 pinned")).toBeVisible();
    await root.context.close();
  });

  test("a workspace's admin pins for it; a member sees the pins as their current workspace", async ({
    browser,
    baseURL,
  }) => {
    const admin = await as(browser, baseURL, "shelvesAdmin");
    // Two items on the workspace's shelf: its own and another public workspace's.
    for (const [path, full] of [
      [shelfItemPage, SHELF_ITEM],
      [doorPage, DOOR_ITEM],
    ] as const) {
      await admin.page.goto(path);
      await admin.page.getByRole("button", { name: "Pin", exact: true }).click();
      const dialog = admin.page.getByRole("dialog");
      // An admin is offered their workspaces, never Start here.
      await expect(dialog.getByRole("listitem").filter({ hasText: "Start here" })).toHaveCount(0);
      await dialog.getByRole("button", { name: `Pin ${full} to ${E2E_SHELVES.workspace}` }).click();
      await expect(
        dialog
          .getByRole("listitem")
          .filter({ hasText: E2E_SHELVES.workspace })
          .getByText("Pinned", { exact: true }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Done" }).click();
    }

    // Their workspace's page shows the shelf, in order, with Manage.
    await admin.page.goto(`/workspaces/${E2E_SHELVES.workspace}`);
    const pinned = region(admin.page, "Pinned items");
    await expect(names(pinned)).toHaveText([SHELF_ITEM, DOOR_ITEM]);
    await pinned.getByRole("button", { name: `Manage ${E2E_SHELVES.workspace}` }).click();
    await admin.page.getByRole("button", { name: `Move ${DOOR_ITEM} up` }).click();
    await expect(
      admin.page.getByRole("dialog").getByRole("listitem").locator("span.font-mono"),
    ).toHaveText([DOOR_ITEM, SHELF_ITEM]);
    // It is kept: the page, read again, has the new order.
    await admin.page.reload();
    await expect(names(region(admin.page, "Pinned items"))).toHaveText([DOOR_ITEM, SHELF_ITEM]);
    await admin.context.close();

    // A member: the shelf on the workspace's page, no Manage; as their current workspace, on Home.
    const member = await as(browser, baseURL, "shelvesMember");
    await member.page.goto(`/workspaces/${E2E_SHELVES.workspace}`);
    await expect(names(region(member.page, "Pinned items"))).toHaveText([DOOR_ITEM, SHELF_ITEM]);
    await expect(member.page.getByRole("button", { name: /^Manage / })).toHaveCount(0);
    await member.page.goto("/");
    await expect(region(member.page, `Pinned in ${E2E_SHELVES.workspace}`)).toHaveCount(0);
    await member.page
      .getByRole("complementary", { name: "Sidebar" })
      .locator("details")
      .first()
      .locator("summary")
      .click();
    await member.page
      .getByRole("complementary", { name: "Sidebar" })
      .locator("details")
      .first()
      .getByRole("link")
      .filter({ hasText: E2E_SHELVES.workspace })
      .first()
      .click();
    await member.page.goto("/");
    const current = region(member.page, `Pinned in ${E2E_SHELVES.workspace}`);
    await expect(names(current)).toHaveText([DOOR_ITEM, SHELF_ITEM]);
    await expect(current.getByRole("button", { name: /^Manage / })).toHaveCount(0);
    await member.context.close();

    // Someone outside the workspace has no such shelf on Home.
    const outsider = await as(browser, baseURL, "shelvesOutsider");
    await outsider.page.goto("/");
    await expect(outsider.page.getByRole("region", { name: /^Pinned in / })).toHaveCount(0);
    await outsider.context.close();
  });

  test("a pin of an item someone cannot see is not shown to them", async ({ browser, baseURL }) => {
    // Root pins the private vault's skill on the workspace's shelf (root sees everything).
    const root = await as(browser, baseURL, "shelvesRoot");
    await root.page.goto(vaultPage);
    await root.page.getByRole("button", { name: "Pin", exact: true }).click();
    const dialog = root.page.getByRole("dialog");
    // Start here is refused for a private workspace's item, with the reason.
    await expect(
      dialog
        .getByRole("listitem")
        .filter({ hasText: "Start here" })
        .getByRole("button", { name: /^Pin / }),
    ).toBeDisabled();
    await dialog.getByLabel("Find a workspace").fill(E2E_SHELVES.workspace);
    await dialog
      .getByRole("button", { name: `Pin ${VAULT_ITEM} to ${E2E_SHELVES.workspace}` })
      .click();
    await expect(
      dialog
        .getByRole("listitem")
        .filter({ hasText: E2E_SHELVES.workspace })
        .getByText("Pinned", { exact: true }),
    ).toBeVisible();
    await root.context.close();

    // A member of the vault sees it on the shelf; a member of the workspace who isn't, does not.
    const vault = await as(browser, baseURL, "shelvesVault");
    await vault.page.goto(`/workspaces/${E2E_SHELVES.workspace}`);
    await expect(names(region(vault.page, "Pinned items"))).toContainText([VAULT_ITEM]);
    await vault.context.close();
    const plain = await as(browser, baseURL, "shelvesMember");
    await plain.page.goto(`/workspaces/${E2E_SHELVES.workspace}`);
    const pinned = region(plain.page, "Pinned items");
    await expect(names(pinned)).toHaveText([DOOR_ITEM, SHELF_ITEM]);
    await expect(plain.page.getByText(VAULT_ITEM)).toHaveCount(0);
    await plain.context.close();

    // The workspace's admin cannot see that pin either, so cannot list it; root removes it, and
    // the admin the rest.
    const cleanup = await as(browser, baseURL, "shelvesRoot");
    await cleanup.page.goto(`/workspaces/${E2E_SHELVES.workspace}`);
    await region(cleanup.page, "Pinned items")
      .getByRole("button", { name: `Manage ${E2E_SHELVES.workspace}` })
      .click();
    await cleanup.page.getByRole("button", { name: `Remove ${VAULT_ITEM}` }).click();
    await expect(cleanup.page.getByText("2 of 12 pinned")).toBeVisible();
    await cleanup.context.close();
    const admin = await as(browser, baseURL, "shelvesAdmin");
    await admin.page.goto(`/workspaces/${E2E_SHELVES.workspace}`);
    await region(admin.page, "Pinned items")
      .getByRole("button", { name: `Manage ${E2E_SHELVES.workspace}` })
      .click();
    for (const full of [DOOR_ITEM, SHELF_ITEM])
      await admin.page.getByRole("button", { name: `Remove ${full}` }).click();
    // An empty shelf is not shown: the page drops it, and its Manage with it.
    await expect(region(admin.page, "Pinned items")).toHaveCount(0);
    await admin.context.close();
  });
});
