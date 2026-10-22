import { expect, type Page, test } from "@playwright/test";
import { closeSteps, openSteps, walkThrough } from "./getting-started";
import { mobileUser, signIn } from "./mobile";
import { measureOverflow, smallTargets } from "./sweep";

const noSidewaysScroll = async (page: Page) => {
  const overflow = await measureOverflow(page);
  expect(overflow.scrollWidth, "the page doesn't scroll sideways").toBeLessThanOrEqual(
    overflow.viewportWidth,
  );
  expect(overflow.offenders).toEqual([]);
};

/** Controls under a finger's size, by the words that name them (067's check counts padded areas). */
const notTouchSized = async (page: Page, names: readonly string[]) => {
  const small = (await smallTargets(page)).map((target) => target.element);
  for (const name of names)
    expect(
      small.filter((element) => element.includes(name)),
      `${name} is touch-sized`,
    ).toEqual([]);
};

/**
 * Feature 126 on a phone and a tablet: Home's Getting started is one slim banner that fits the
 * screen at this device's width and at 320px, its buttons are 44px tall, and its steps open in a
 * dialog that fills the phone, stacked, with the long `rmk login` lines wrapping.
 */
test("the banner fits, and its steps open in a dialog that fits too", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "starter"));
  await page.goto("/");
  const banner = page.getByRole("region", { name: "Getting started" });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("heading", { level: 2 })).toContainText("0 of 4 done");

  for (const width of [page.viewportSize()?.width ?? 0, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await noSidewaysScroll(page);
    // Slim: the banner is a few lines, not a list of steps.
    const box = await banner.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(260);
  }
  await notTouchSized(page, ["Hide Getting started", "Open CLI & tokens", "See all steps"]);

  // The steps: a dialog, stacked, with the commands inside the screen.
  const dialog = await openSteps(page, "See all steps");
  const steps = dialog.getByRole("listitem").filter({ has: page.getByRole("heading") });
  const boxes = await steps.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top };
    }),
  );
  expect(boxes).toHaveLength(4);
  for (const box of boxes) expect(box.left).toBe(boxes[0]?.left);
  expect(new Set(boxes.map((box) => box.top)).size).toBe(4);
  const web = dialog.getByText(/rmk login --registry .* --web$/);
  await expect(web).toBeVisible();
  const where = await web.boundingBox();
  expect(where?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((where?.x ?? 0) + (where?.width ?? 0)).toBeLessThanOrEqual(321);
  await noSidewaysScroll(page);
  await notTouchSized(page, ["I’ve installed one", "Browse the catalogue", "Propose item"]);
  expect(await dialog.getByRole("button", { name: /^copy$/i }).count()).toBeGreaterThan(0);
  await closeSteps(dialog);
});

/** Item cards on Home: one to a row on a phone, never more than two on a tablet. */
test("Home's item cards are a single column on a phone and at most two on a tablet", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "starter"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Recently published" })).toBeVisible();
  const lefts = await page
    .locator("main article")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
  expect(lefts.length).toBeGreaterThan(1);
  const columns = new Set(lefts).size;
  const phone = (page.viewportSize()?.width ?? 0) < 640;
  expect(columns).toBeLessThanOrEqual(phone ? 1 : 2);
  await noSidewaysScroll(page);
});

/** The same walk-through as on a desktop, by touch: every step works at this device's size. */
test("a new person walks through the checklist by touch", async ({ page, request }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "starterFlow"));
  await walkThrough(page, request);
});
