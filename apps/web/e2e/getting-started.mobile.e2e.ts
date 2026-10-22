import { expect, type Locator, type Page, test } from "@playwright/test";
import { walkThrough } from "./getting-started";
import { mobileUser, signIn } from "./mobile";
import { measureOverflow, smallTargets } from "./sweep";

const noSidewaysScroll = async (page: Page) => {
  const overflow = await measureOverflow(page);
  expect(overflow.scrollWidth, "the page doesn't scroll sideways").toBeLessThanOrEqual(
    overflow.viewportWidth,
  );
  expect(overflow.offenders).toEqual([]);
};

/**
 * Feature 126 on a phone and a tablet: Home's Getting started is a stacked list that fits the
 * screen at this device's width and at 320px, its buttons and links are 44px tall, and its long
 * `rmk login` lines wrap instead of running off the screen.
 */
test("the checklist fits, wraps its commands and has touch-sized actions", async ({
  page,
}, testInfo) => {
  await signIn(page, mobileUser(testInfo, "starter"));
  await page.goto("/");
  const checklist = page.getByRole("region", { name: "Getting started" });
  await expect(checklist).toBeVisible();
  await expect(checklist.getByText("0 of 4 done")).toBeVisible();

  for (const width of [page.viewportSize()?.width ?? 0, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await noSidewaysScroll(page);
    const steps = checklist.getByRole("listitem").filter({ has: page.getByRole("heading") });
    // Stacked: each step is as wide as the checklist, none beside another.
    const boxes = await steps.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      }),
    );
    expect(boxes).toHaveLength(4);
    for (const box of boxes) expect(box.left).toBe(boxes[0]?.left);
    expect(new Set(boxes.map((box) => box.top)).size).toBe(4);
  }

  // The long sign-in lines wrap inside the screen: the last words are in view.
  const web = checklist.getByText(/rmk login --registry .* --web$/);
  await expect(web).toBeVisible();
  const box = await web.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(321);

  // Every control on the page is a finger's size (067's check, which counts a link's padded hit
  // area), and the checklist's own are among them.
  const small = (await smallTargets(page)).map((target) => target.element);
  for (const name of [
    "Hide Getting started",
    "I’ve installed one",
    "Open CLI & tokens",
    "Browse the catalogue",
    "Propose item",
  ])
    expect(
      small.filter((element) => element.includes(name)),
      `${name} is touch-sized`,
    ).toEqual([]);
  expect(await checklist.getByRole("button", { name: /^copy$/i }).count()).toBeGreaterThan(0);
});

/** The same walk-through as on a desktop, by touch: every step works at this device's size. */
test("a new person walks through the checklist by touch", async ({ page, request }, testInfo) => {
  await signIn(page, mobileUser(testInfo, "starterFlow"));
  await walkThrough(page, request);
});
