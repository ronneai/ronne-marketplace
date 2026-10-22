import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * Feature 124: Home on an instance that has released items. The sections come in their order,
 * the search box offers a link per type that has items, and the empty-instance message is gone
 * (a fresh instance is covered by the setup wizard test).
 */
test("Home shows search, the type links, then the lists, and not the empty message", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.homeMember);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);

  await expect(page.getByRole("heading", { level: 1, name: "Ronne AI Marketplace" })).toBeVisible();
  await expect(page.getByText("Find what’s reviewed and released")).toBeVisible();
  await expect(page.getByText("Nothing is published yet.")).toHaveCount(0);

  // The search box, then a link for each type that has items, then Recently published.
  const search = page.getByLabel("Search the catalogue");
  const types = page.getByRole("navigation", { name: "Browse by type" });
  const recent = page.getByRole("heading", { level: 2, name: "Recently published" });
  await expect(search).toBeVisible();
  await expect(types).toBeVisible();
  await expect(recent).toBeVisible();
  const [searchBox, typesBox, recentBox] = await Promise.all([
    search.boundingBox(),
    types.boundingBox(),
    recent.boundingBox(),
  ]);
  expect(searchBox?.y ?? 0).toBeLessThan(typesBox?.y ?? 0);
  expect(typesBox?.y ?? 0).toBeLessThan(recentBox?.y ?? 0);

  // A type with items opens the catalogue on it; one without has no link.
  await expect(types.getByRole("link", { name: "Skill" })).toHaveAttribute(
    "href",
    "/catalogue?type=skill",
  );
  await expect(types.locator('a[href*="type=bundle"]')).toHaveCount(0);
  await types.getByRole("link", { name: "Skill" }).click();
  await expect(page).toHaveURL(/\/catalogue\?type=skill/);

  // Searching goes to the catalogue with the words.
  await page.goto("/");
  await search.fill("zzz-no-such-item");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/catalogue\?q=zzz-no-such-item/);
});

/**
 * The item cards are a grid (owner, 2026-10-21): four to a row on a wide screen, one to a row on a
 * phone-sized window, the cards of a row the same height.
 */
test("Home's item cards go four to a row on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(E2E_USERS.homeMember);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  const recent = page.getByRole("heading", { level: 2, name: "Recently published" });
  await expect(recent).toBeVisible();
  const cards = page.locator("section[aria-labelledby='recent'] article");
  expect(await cards.count()).toBeGreaterThanOrEqual(4);
  const boxes = await cards.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), height: Math.round(r.height) };
    }),
  );
  const first = boxes.filter((box) => box.top === boxes[0]?.top);
  expect(first).toHaveLength(4);
  // Equal heights in a row: the install line sits at the bottom of every card.
  expect(new Set(first.map((box) => box.height)).size).toBe(1);

  await page.setViewportSize({ width: 390, height: 900 });
  const narrow = await cards.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().left)),
  );
  expect(new Set(narrow).size).toBe(1);
});

const signInHome = async (
  page: import("@playwright/test").Page,
  email: string = E2E_USERS.homeMember,
) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
};

/** The boxes of the cards in a list, measured in the browser. */
const cardBoxes = (page: import("@playwright/test").Page, selector: string) =>
  page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    }),
  );

/**
 * The cards keep their shape while the window is resized (owner, 2026-10-21): the columns change on
 * their own, a card is never narrower than 17rem (272px), a row never has more than five, and its height hardly changes, so it
 * doesn't turn tall just before a column drops off.
 */
test("Home's cards keep their size and shape at every window width", async ({ page }) => {
  await signInHome(page);
  const heights: number[] = [];
  for (const width of [
    900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1920, 2200, 2560,
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    const boxes = await cardBoxes(page, "section[aria-labelledby='recent'] article");
    expect(boxes.length, `cards at ${width}px`).toBeGreaterThanOrEqual(4);
    const widths = boxes.map((box) => box.width);
    expect(Math.min(...widths), `narrowest card at ${width}px`).toBeGreaterThanOrEqual(270);
    expect(Math.max(...widths) / Math.min(...widths), `widths at ${width}px`).toBeLessThan(1.05);
    // The cards of the first row are the same height: the install line sits at the bottom.
    const first = boxes.filter((box) => box.top === boxes[0]?.top);
    expect(new Set(first.map((box) => box.height)).size, `row heights at ${width}px`).toBe(1);
    heights.push(boxes[0]?.height ?? 0);
    // As many columns as fit with 17rem each, never more than five: the count follows the room the
    // list has (not the window), so a column never drops off earlier or later than it must, and a
    // card is never wider than a column's share, whatever breakpoints the CSS has.
    const room = await page
      .locator("section[aria-labelledby='recent'] ul")
      .evaluate((el) => el.clientWidth);
    const fit = Math.min(5, Math.max(1, Math.floor((room + 12) / (272 + 12))));
    expect(first.length, `cards in a row at ${width}px, list ${room}px wide`).toBe(
      Math.min(fit, boxes.length),
    );
    expect(Math.max(...widths), `widest card at ${width}px`).toBeLessThanOrEqual(
      (room - 12 * (fit - 1)) / fit + 1,
    );
  }
  expect(Math.max(...heights) / Math.min(...heights), `heights ${heights.join(", ")}`).toBeLessThan(
    1.2,
  );
});

/** A long description is cut at two lines with an ellipsis, and a long name at two as well. */
test("a long description and a long name are cut at two lines on a card", async ({ page }) => {
  await signInHome(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const card = page.locator("section[aria-labelledby='recent'] article").first();
  await expect(card).toBeVisible();
  const measured = await card.evaluate((el) => {
    const description = el.querySelector("p.line-clamp-2") as HTMLElement;
    const name = el.querySelector("h3 a") as HTMLElement;
    description.textContent = "A long description. ".repeat(40);
    name.textContent = `@${"very-long-workspace-".repeat(6)}/${"scope-".repeat(8)}/${"name-".repeat(8)}`;
    const line = (node: HTMLElement) => Number.parseFloat(getComputedStyle(node).lineHeight);
    const d = getComputedStyle(description);
    return {
      descriptionLines: description.clientHeight / line(description),
      descriptionCut: description.scrollHeight > description.clientHeight,
      descriptionClamp: d.getPropertyValue("-webkit-line-clamp"),
      descriptionOverflow: d.overflow,
      nameLines: name.clientHeight / line(name),
      nameCut: name.scrollHeight > name.clientHeight,
    };
  });
  expect(measured.descriptionLines).toBeCloseTo(2, 0);
  expect(measured.descriptionCut).toBe(true);
  expect(measured.descriptionClamp).toBe("2");
  expect(measured.descriptionOverflow).toBe("hidden");
  expect(measured.nameLines).toBeLessThanOrEqual(2.1);
  expect(measured.nameCut).toBe(true);
});

/** The Catalogue lists the same compact cards, in the same grid. */
test("the Catalogue lists the compact cards, several to a row on a wide screen", async ({
  page,
}) => {
  await signInHome(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/catalogue");
  const cards = page.locator("main article");
  await expect(cards.first()).toBeVisible();
  const boxes = await cardBoxes(page, "main article");
  const first = boxes.filter((box) => box.top === boxes[0]?.top);
  expect(first.length).toBeGreaterThanOrEqual(3);
  expect(Math.min(...boxes.map((box) => box.width))).toBeGreaterThanOrEqual(270);
  // Compact: the copy icon, not a box with the command in it.
  await expect(
    cards.first().getByRole("button", { name: /^Copy the install command for / }),
  ).toBeVisible();
  await expect(cards.first().locator("code")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  const narrow = await cardBoxes(page, "main article");
  expect(new Set(narrow.map((box) => box.top)).size).toBe(narrow.length);
});

/** The copy icon copies the install command, and says so. */
test("a card's copy icon copies its install command", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInHome(page, E2E_USERS.homeCopier);
  const button = page
    .locator("section[aria-labelledby='recent'] article")
    .first()
    .getByRole("button", { name: /^Copy the install command for / });
  await expect(button).toHaveAttribute("title", /^rmk install @/);
  const title = (await button.getAttribute("title")) ?? "";
  await button.click();
  await expect(button.getByText("copied")).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(title);
});

/** Five to a row on a very wide screen, and no more however wide it is. */
test("Home's cards stop at five to a row", async ({ page }) => {
  await signInHome(page, E2E_USERS.homeCards);
  for (const width of [1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    const boxes = await cardBoxes(page, "section[aria-labelledby='recent'] article");
    const first = boxes.filter((box) => box.top === boxes[0]?.top);
    expect(boxes.length, "enough cards to fill a row").toBeGreaterThanOrEqual(5);
    expect(first.length, `cards in a row at ${width}px`).toBe(5);
  }
});
